import re
from datetime import UTC, datetime, timedelta

from app.schemas import Interval

_RELATIVE = re.compile(r"^-(\d+)([hdwmy])$")
_UNIT_DAYS = {"d": 1, "w": 7, "m": 30, "y": 365}

MAX_BUCKETS = 2000


class DateRangeError(ValueError):
    pass


def parse_date(value: str | None, now: datetime) -> datetime:
    """Accepts relative ("-7d", "-24h", "-3m", "-1y"), ISO dates, or None (= now)."""
    if value is None or value == "now":
        return now
    match = _RELATIVE.match(value)
    if match:
        amount, unit = int(match.group(1)), match.group(2)
        if unit == "h":
            return now - timedelta(hours=amount)
        return now - timedelta(days=amount * _UNIT_DAYS[unit])
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as e:
        raise DateRangeError(f"Invalid date: {value!r}") from e
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def truncate(dt: datetime, interval: Interval) -> datetime:
    """Mirrors Postgres date_trunc(interval, ts, 'UTC')."""
    dt = dt.astimezone(UTC)
    if interval == "hour":
        return dt.replace(minute=0, second=0, microsecond=0)
    day = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    if interval == "day":
        return day
    if interval == "week":
        return day - timedelta(days=day.weekday())
    return day.replace(day=1)


def step(dt: datetime, interval: Interval) -> datetime:
    if interval == "hour":
        return dt + timedelta(hours=1)
    if interval == "day":
        return dt + timedelta(days=1)
    if interval == "week":
        return dt + timedelta(weeks=1)
    if dt.month == 12:
        return dt.replace(year=dt.year + 1, month=1)
    return dt.replace(month=dt.month + 1)


def buckets(start: datetime, end: datetime, interval: Interval) -> list[datetime]:
    out: list[datetime] = []
    cur = truncate(start, interval)
    while cur <= end:
        out.append(cur)
        if len(out) > MAX_BUCKETS:
            raise DateRangeError(
                f"Too many {interval} buckets in this range; pick a larger interval"
            )
        cur = step(cur, interval)
    return out
