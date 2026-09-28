"""Public API used by SDKs and customer backends.

- Public project key (`nb_pk_...`, safe to ship in browsers): capture events, evaluate flags.
- Secret key (`Authorization: Bearer nb_sk_...`): run queries, read saved insights.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Body, HTTPException, status
from sqlalchemy import func, insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import DB, SecretKeyProject, project_id_for_public_key
from app.models import Event, EventDefinition, Insight
from app.schemas import (
    AnyQuery,
    BatchRequest,
    CaptureEvent,
    CaptureRequest,
    FlagsRequest,
    FlagsResponse,
    QueryResult,
)
from app.services import flags as flag_service
from app.services.query import run_insight, run_query

router = APIRouter(prefix="/v1", tags=["public"])

MAX_CLOCK_SKEW = timedelta(hours=1)


async def _require_project(db: AsyncSession, api_key: str) -> uuid.UUID:
    project_id = await project_id_for_public_key(db, api_key)
    if project_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid project API key")
    return project_id


async def ingest(db: AsyncSession, project_id: uuid.UUID, events: list[CaptureEvent]) -> int:
    now = datetime.now(UTC)
    rows = []
    for e in events:
        ts = e.timestamp or now
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        if ts > now + MAX_CLOCK_SKEW:
            ts = now
        rows.append(
            {
                "project_id": project_id,
                "event": e.event,
                "distinct_id": e.distinct_id,
                "properties": e.properties,
                "timestamp": ts,
            }
        )
    await db.execute(insert(Event), rows)

    # Keep the event catalogue up to date (one row per distinct event name).
    stats: dict[str, dict] = {}
    for row in rows:
        s = stats.setdefault(
            row["event"], {"first": row["timestamp"], "last": row["timestamp"], "count": 0}
        )
        s["first"] = min(s["first"], row["timestamp"])
        s["last"] = max(s["last"], row["timestamp"])
        s["count"] += 1
    stmt = pg_insert(EventDefinition).values(
        [
            {
                "project_id": project_id,
                "name": name,
                "description": "",
                "first_seen_at": s["first"],
                "last_seen_at": s["last"],
                "total_count": s["count"],
            }
            for name, s in sorted(stats.items())
        ]
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[EventDefinition.project_id, EventDefinition.name],
        set_={
            "first_seen_at": func.least(EventDefinition.first_seen_at, stmt.excluded.first_seen_at),
            "last_seen_at": func.greatest(EventDefinition.last_seen_at, stmt.excluded.last_seen_at),
            "total_count": EventDefinition.total_count + stmt.excluded.total_count,
        },
    )
    await db.execute(stmt)
    await db.commit()
    return len(rows)


@router.post("/capture")
async def capture(body: CaptureRequest, db: DB) -> dict:
    project_id = await _require_project(db, body.api_key)
    await ingest(db, project_id, [body])
    return {"status": "ok"}


@router.post("/batch")
async def batch(body: BatchRequest, db: DB) -> dict:
    project_id = await _require_project(db, body.api_key)
    count = await ingest(db, project_id, body.batch)
    return {"status": "ok", "count": count}


@router.post("/flags", response_model=FlagsResponse)
async def flags(body: FlagsRequest, db: DB) -> FlagsResponse:
    project_id = await _require_project(db, body.api_key)
    return FlagsResponse(flags=await flag_service.evaluate(db, project_id, body.distinct_id))


@router.post("/query", response_model=QueryResult)
async def query(project_id: SecretKeyProject, db: DB, body: AnyQuery = Body(...)):
    return await run_query(db, project_id, body)


@router.get("/insights/{insight_id}/result", response_model=QueryResult)
async def insight_result(insight_id: uuid.UUID, project_id: SecretKeyProject, db: DB):
    insight = await db.get(Insight, insight_id)
    if insight is None or insight.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Insight not found")
    return await run_insight(db, insight)
