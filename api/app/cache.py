"""Thin Redis cache. Every call degrades to a miss if Redis is unavailable."""

import json
import logging
from typing import Any

from redis.asyncio import Redis

from app.config import settings

log = logging.getLogger(__name__)
redis = Redis.from_url(settings.redis_url, decode_responses=True)


async def get_json(key: str) -> Any | None:
    try:
        raw = await redis.get(key)
    except Exception:
        log.warning("redis get failed", exc_info=True)
        return None
    return json.loads(raw) if raw else None


async def set_json(key: str, value: Any, ttl: int = 60) -> None:
    try:
        await redis.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception:
        log.warning("redis set failed", exc_info=True)


async def delete(*keys: str) -> None:
    try:
        await redis.delete(*keys)
    except Exception:
        log.warning("redis delete failed", exc_info=True)
