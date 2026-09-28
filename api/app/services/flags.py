import hashlib
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import cache
from app.models import FeatureFlag

_HASH_SCALE = float(0xFFFFFFFFFFFFFFF)


def rollout_hash(flag_key: str, distinct_id: str) -> float:
    """Stable value in [0, 1) for a (flag, user) pair, so rollouts don't flicker."""
    digest = hashlib.sha1(f"{flag_key}.{distinct_id}".encode()).hexdigest()[:15]
    return int(digest, 16) / _HASH_SCALE


def is_enabled(active: bool, rollout_percentage: int, flag_key: str, distinct_id: str) -> bool:
    if not active or rollout_percentage <= 0:
        return False
    if rollout_percentage >= 100:
        return True
    return rollout_hash(flag_key, distinct_id) < rollout_percentage / 100


def _cache_key(project_id: uuid.UUID) -> str:
    return f"flags:{project_id}"


async def flag_definitions(db: AsyncSession, project_id: uuid.UUID) -> list[dict]:
    cached = await cache.get_json(_cache_key(project_id))
    if cached is not None:
        return cached
    rows = await db.execute(
        select(FeatureFlag.key, FeatureFlag.active, FeatureFlag.rollout_percentage).where(
            FeatureFlag.project_id == project_id
        )
    )
    flags = [{"key": key, "active": active, "rollout_percentage": pct} for key, active, pct in rows]
    await cache.set_json(_cache_key(project_id), flags, ttl=60)
    return flags


async def evaluate(db: AsyncSession, project_id: uuid.UUID, distinct_id: str) -> dict[str, bool]:
    return {
        f["key"]: is_enabled(f["active"], f["rollout_percentage"], f["key"], distinct_id)
        for f in await flag_definitions(db, project_id)
    }


async def invalidate(project_id: uuid.UUID) -> None:
    await cache.delete(_cache_key(project_id))
