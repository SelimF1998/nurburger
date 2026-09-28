"""Compiles a visual-builder TrendsQuery into SQL against the events table."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    ColumnElement,
    Numeric,
    and_,
    case,
    cast,
    distinct,
    func,
    literal,
    or_,
    select,
    text,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.expression import literal_column

from app.models import Event
from app.schemas import PropertyFilter, Series, TrendsQuery, TrendsResult, TrendsSeriesResult
from app.services.dates import DateRangeError, buckets, parse_date

BREAKDOWN_LIMIT = 10
_NUMERIC_RE = r"^-?\d+(\.\d+)?([eE][-+]?\d+)?$"


class QueryError(ValueError):
    pass


def prop(key: str) -> ColumnElement[str]:
    return Event.properties[key].astext


def numeric(expr: ColumnElement[str]) -> ColumnElement:
    """Casts a property to numeric, yielding NULL for non-numeric values instead of erroring."""
    return case((expr.op("~")(_NUMERIC_RE), cast(expr, Numeric)), else_=None)


def _as_text(value: str | float | None) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return "" if value is None else str(value)


def _as_number(f: PropertyFilter) -> float:
    try:
        return float(f.value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as e:
        raise QueryError(f"Filter on {f.key!r} needs a numeric value") from e


def filter_condition(f: PropertyFilter) -> ColumnElement[bool]:
    p = prop(f.key)
    match f.operator:
        case "is_set":
            return Event.properties.has_key(f.key)
        case "is_not_set":
            return ~Event.properties.has_key(f.key)
        case "eq":
            return p == _as_text(f.value)
        case "neq":
            return or_(p != _as_text(f.value), p.is_(None))
        case "contains":
            return p.ilike(f"%{_escape_like(_as_text(f.value))}%", escape="\\")
        case "not_contains":
            return or_(~p.ilike(f"%{_escape_like(_as_text(f.value))}%", escape="\\"), p.is_(None))
        case "gt":
            return numeric(p) > _as_number(f)
        case "lt":
            return numeric(p) < _as_number(f)
    raise QueryError(f"Unknown operator {f.operator}")


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _aggregate(series: Series) -> ColumnElement:
    if series.math == "total":
        return func.count()
    if series.math == "unique_users":
        return func.count(distinct(Event.distinct_id))
    if not series.math_property:
        raise QueryError(f"'{series.math}' needs a property to aggregate")
    value = numeric(prop(series.math_property))
    return {"sum": func.sum, "avg": func.avg, "min": func.min, "max": func.max}[series.math](value)


def _label(series: Series) -> str:
    if series.label:
        return series.label
    base = series.event or "All events"
    if series.math == "total":
        return base
    if series.math == "unique_users":
        return f"{base} · unique users"
    return f"{base} · {series.math}({series.math_property})"


async def resolve_range(
    db: AsyncSession, project_id: uuid.UUID, q: TrendsQuery
) -> tuple[datetime, datetime]:
    now = datetime.now(UTC)
    try:
        if q.date_from == "all":
            first = await db.scalar(
                select(func.min(Event.timestamp)).where(Event.project_id == project_id)
            )
            start = first or now
        else:
            start = parse_date(q.date_from, now)
        end = parse_date(q.date_to, now)
    except DateRangeError as e:
        raise QueryError(str(e)) from e
    if start > end:
        raise QueryError("Start date is after end date")
    return start, end


async def run_trends(db: AsyncSession, project_id: uuid.UUID, q: TrendsQuery) -> TrendsResult:
    start, end = await resolve_range(db, project_id, q)
    try:
        labels = buckets(start, end, q.interval)
    except DateRangeError as e:
        raise QueryError(str(e)) from e
    index = {b: i for i, b in enumerate(labels)}

    bucket = func.date_trunc(
        literal_column(f"'{q.interval}'"), Event.timestamp, literal_column("'UTC'")
    )
    results: list[TrendsSeriesResult] = []

    for series in q.series:
        conditions = [
            Event.project_id == project_id,
            Event.timestamp >= start,
            Event.timestamp <= end,
            *(filter_condition(f) for f in [*q.filters, *series.filters]),
        ]
        if series.event:
            conditions.append(Event.event == series.event)
        where = and_(*conditions)
        agg = _aggregate(series)

        if not q.breakdown:
            rows = await db.execute(select(bucket, agg).where(where).group_by(text("1")))
            data = [0.0] * len(labels)
            for ts, value in rows:
                i = index.get(ts.astimezone(UTC))
                if i is not None:
                    data[i] = float(value or 0)
            results.append(
                TrendsSeriesResult(
                    label=_label(series), event=series.event, data=data, total=_total(series, data)
                )
            )
            continue

        breakdown = func.coalesce(prop(q.breakdown), literal("(none)"))
        top = await db.execute(
            select(breakdown, func.count())
            .where(where)
            .group_by(text("1"))
            .order_by(text("2 DESC"))
            .limit(BREAKDOWN_LIMIT)
        )
        values = [v for v, _ in top]
        if not values:
            continue
        rows = await db.execute(
            select(bucket, breakdown, agg)
            .where(where, breakdown.in_(values))
            .group_by(text("1"), text("2"))
        )
        by_value: dict[str, list[float]] = {v: [0.0] * len(labels) for v in values}
        for ts, value, amount in rows:
            i = index.get(ts.astimezone(UTC))
            if i is not None:
                by_value[value][i] = float(amount or 0)
        for value in values:
            data = by_value[value]
            results.append(
                TrendsSeriesResult(
                    label=f"{_label(series)} · {value}",
                    event=series.event,
                    breakdown_value=value,
                    data=data,
                    total=_total(series, data),
                )
            )

    return TrendsResult(labels=labels, interval=q.interval, series=results)


def _total(series: Series, data: list[float]) -> float:
    # Summing per-bucket uniques over-counts, but matches what the chart shows; averages,
    # mins and maxes are summarised with the same function across buckets.
    if series.math == "avg":
        non_zero = [d for d in data if d]
        return sum(non_zero) / len(non_zero) if non_zero else 0.0
    if series.math == "min":
        return min((d for d in data if d), default=0.0)
    if series.math == "max":
        return max(data, default=0.0)
    return sum(data)
