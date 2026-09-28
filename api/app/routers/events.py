import base64
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select, text, tuple_

from app.deps import DB, ProjectCtx
from app.models import Event, EventDefinition
from app.schemas import EventDefinitionOut, EventDefinitionUpdate, EventOut, EventPage

router = APIRouter(prefix="/api/projects/{project_id}", tags=["events"])

PROPERTY_SAMPLE = 5000


def _encode_cursor(event: Event) -> str:
    return base64.urlsafe_b64encode(f"{event.timestamp.isoformat()}|{event.id}".encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, int]:
    try:
        ts, id_ = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(ts), int(id_)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid cursor") from e


@router.get("/events", response_model=EventPage)
async def list_events(
    ctx: ProjectCtx,
    db: DB,
    event: str | None = None,
    distinct_id: str | None = None,
    search: str | None = None,
    cursor: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> EventPage:
    stmt = select(Event).where(Event.project_id == ctx.id)
    if event:
        stmt = stmt.where(Event.event == event)
    if distinct_id:
        stmt = stmt.where(Event.distinct_id == distinct_id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(Event.event.ilike(like), Event.distinct_id.ilike(like)))
    if cursor:
        ts, id_ = _decode_cursor(cursor)
        stmt = stmt.where(tuple_(Event.timestamp, Event.id) < tuple_(ts, id_))
    rows = (
        await db.scalars(stmt.order_by(Event.timestamp.desc(), Event.id.desc()).limit(limit + 1))
    ).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return EventPage(
        results=[EventOut.model_validate(r) for r in rows],
        next_cursor=_encode_cursor(rows[-1]) if has_more and rows else None,
    )


@router.get("/event-definitions", response_model=list[EventDefinitionOut])
async def list_event_definitions(ctx: ProjectCtx, db: DB) -> list[EventDefinitionOut]:
    definitions = (
        await db.scalars(
            select(EventDefinition)
            .where(EventDefinition.project_id == ctx.id)
            .order_by(EventDefinition.last_seen_at.desc())
        )
    ).all()
    since = datetime.now(UTC) - timedelta(days=30)
    volumes = dict(
        (
            await db.execute(
                select(Event.event, func.count())
                .where(Event.project_id == ctx.id, Event.timestamp >= since)
                .group_by(Event.event)
            )
        ).all()
    )
    return [
        EventDefinitionOut.model_validate(d).model_copy(
            update={"volume_30d": volumes.get(d.name, 0)}
        )
        for d in definitions
    ]


@router.patch("/event-definitions/{name}", status_code=204)
async def update_event_definition(
    name: str, body: EventDefinitionUpdate, ctx: ProjectCtx, db: DB
) -> None:
    definition = await db.get(EventDefinition, (ctx.id, name))
    if definition is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    definition.description = body.description
    await db.commit()


@router.get("/property-keys", response_model=list[str])
async def property_keys(ctx: ProjectCtx, db: DB, event: str | None = None) -> list[str]:
    """Property keys seen on the most recent events (sampled for speed)."""
    sample = select(Event.properties).where(Event.project_id == ctx.id)
    if event:
        sample = sample.where(Event.event == event)
    sample = sample.order_by(Event.timestamp.desc()).limit(PROPERTY_SAMPLE).subquery()
    keys = await db.scalars(
        select(func.jsonb_object_keys(sample.c.properties).label("key"))
        .distinct()
        .order_by(text("key"))
    )
    return list(keys.all())


@router.get("/property-values", response_model=list[str])
async def property_values(ctx: ProjectCtx, db: DB, key: str, event: str | None = None) -> list[str]:
    value = Event.properties[key].astext
    sample = select(value.label("value")).where(Event.project_id == ctx.id, value.is_not(None))
    if event:
        sample = sample.where(Event.event == event)
    sample = sample.order_by(Event.timestamp.desc()).limit(PROPERTY_SAMPLE).subquery()
    rows = await db.scalars(
        select(sample.c.value).group_by(sample.c.value).order_by(func.count().desc()).limit(25)
    )
    return list(rows.all())
