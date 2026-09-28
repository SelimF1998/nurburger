"""Creates, refreshes and feeds the shared demo project.

- `ensure_demo()` seeds it if missing, or regenerates it once the data is stale.
  Seeding runs in a single transaction, so users never see a half-built demo.
- `live_loop()` keeps sessions arriving in real time.

Postgres advisory locks keep multiple API workers from doing either twice.
"""

import asyncio
import heapq
import json
import logging
import random
import time
from datetime import UTC, datetime, timedelta

import asyncpg
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app import cache
from app.config import settings
from app.db import SessionLocal, engine
from app.demo import fixtures
from app.demo.generator import FLAGS, generate, live_session
from app.models import Dashboard, DashboardTile, FeatureFlag, Insight, Organization, Project
from app.routers.public import ingest
from app.schemas import CaptureEvent
from app.security import new_public_key

log = logging.getLogger("nurburger.demo")

SEED_LOCK = 72_001
LIVE_LOCK = 72_002
DEMO_ORG = "Nurburger Demo"
DEMO_PROJECT = "Acme Tasks"
KNOWN_USERS = 3800


async def _delete_demo(db: AsyncSession) -> None:
    project = await db.scalar(select(Project).where(Project.is_demo))
    if project is None:
        return
    await cache.delete(f"flags:{project.id}", f"pk:{project.public_key}")
    # Deleting the org cascades to the project and all of its data.
    await db.execute(delete(Organization).where(Organization.id == project.org_id))
    await db.flush()


async def _copy_events(db: AsyncSession, project_id, now: datetime) -> int:
    conn = await db.connection()
    raw = await conn.get_raw_connection()
    pg: asyncpg.Connection = raw.driver_connection  # type: ignore[assignment]

    def build() -> list[tuple]:
        rows = [
            (project_id, e["event"], e["distinct_id"], json.dumps(e["properties"]), e["timestamp"])
            for e in generate(now)
        ]
        rows.sort(key=lambda r: r[4])  # insert in time order, like real ingestion
        return rows

    records = await asyncio.to_thread(build)  # ~1.5s of CPU; keep the event loop free
    await pg.copy_records_to_table(
        "events",
        records=records,
        columns=["project_id", "event", "distinct_id", "properties", "timestamp"],
    )
    await db.execute(
        text(
            """
            INSERT INTO event_definitions
              (project_id, name, description, first_seen_at, last_seen_at, total_count)
            SELECT project_id, event, '', min(timestamp), max(timestamp), count(*)
            FROM events WHERE project_id = :pid GROUP BY project_id, event
            """
        ),
        {"pid": project_id},
    )
    return len(records)


async def _add_fixtures(db: AsyncSession, project_id) -> None:
    for key, (active, pct, description) in FLAGS.items():
        db.add(
            FeatureFlag(
                project_id=project_id,
                key=key,
                name="",
                description=description,
                active=active,
                rollout_percentage=pct,
            )
        )
    insights: dict[str, Insight] = {}
    for name, (description, query, viz) in fixtures.INSIGHTS.items():
        insights[name] = Insight(
            project_id=project_id,
            name=name,
            description=description,
            kind=query["kind"],
            query=query,
            viz={"x": None, "y": [], **viz},
        )
        db.add(insights[name])
    await db.flush()
    for name, description, tiles in fixtures.DASHBOARDS:
        dashboard = Dashboard(project_id=project_id, name=name, description=description)
        dashboard.tiles = [
            DashboardTile(insight_id=insights[insight].id, position=i, width=width)
            for i, (insight, width) in enumerate(tiles)
        ]
        db.add(dashboard)


async def seed(force: bool = False) -> bool:
    """Seeds the demo if needed. Returns True if it (re)built it."""
    async with engine.connect() as lock_conn:
        got = await lock_conn.scalar(text("SELECT pg_try_advisory_lock(:k)"), {"k": SEED_LOCK})
        if not got:
            log.info("demo seed already running elsewhere")
            return False
        try:
            async with SessionLocal() as db:
                existing = await db.scalar(select(Project).where(Project.is_demo))
                stale = existing is not None and existing.created_at < datetime.now(
                    UTC
                ) - timedelta(days=settings.demo_refresh_days)
                if existing is not None and not force and not stale:
                    return False

                started = time.perf_counter()
                await _delete_demo(db)
                org = Organization(name=DEMO_ORG)
                db.add(org)
                await db.flush()
                project = Project(
                    org_id=org.id, name=DEMO_PROJECT, public_key=new_public_key(), is_demo=True
                )
                db.add(project)
                await db.flush()
                count = await _copy_events(db, project.id, datetime.now(UTC))
                await _add_fixtures(db, project.id)
                await db.commit()
                # Refresh planner stats now; until autovacuum gets to it, bulk-loaded
                # data can produce plans that are 50x slower.
                await db.execute(text("ANALYZE events"))
                await db.commit()
                log.info("demo seeded: %d events in %.1fs", count, time.perf_counter() - started)
                return True
        finally:
            await lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": SEED_LOCK})


async def live_loop() -> None:
    """Starts a new session every ~20–60s and inserts each event when its time comes."""
    async with engine.connect() as lock_conn:
        got = await lock_conn.scalar(text("SELECT pg_try_advisory_lock(:k)"), {"k": LIVE_LOCK})
        if not got:
            log.info("demo live events already running in another worker")
            return
        rng = random.Random()
        pending: list[tuple[datetime, int, dict]] = []
        seq = 0
        next_session = datetime.now(UTC)
        log.info("demo live events started")
        try:
            while True:
                now = datetime.now(UTC)
                if now >= next_session:
                    for e in live_session(now, rng, KNOWN_USERS):
                        seq += 1
                        heapq.heappush(pending, (e["timestamp"], seq, e))
                    next_session = now + timedelta(seconds=rng.uniform(20, 60))

                due = []
                while pending and pending[0][0] <= now:
                    due.append(heapq.heappop(pending)[2])
                if due:
                    await _insert_live(due)
                await asyncio.sleep(1)
        finally:
            await lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": LIVE_LOCK})


async def _insert_live(events: list[dict]) -> None:
    async with SessionLocal() as db:
        project_id = await db.scalar(select(Project.id).where(Project.is_demo))
        if project_id is None:
            return
        await ingest(db, project_id, [CaptureEvent(**e) for e in events])


async def run() -> None:
    """Background task started with the API."""
    try:
        await seed()
        if settings.demo_live:
            await live_loop()
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("demo task failed")
