"""Ponte com a fila do ARQ."""

from __future__ import annotations

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from verso_core.config import get_settings

_pool: ArqRedis | None = None


async def get_pool() -> ArqRedis:
    global _pool
    if _pool is None:
        _pool = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
