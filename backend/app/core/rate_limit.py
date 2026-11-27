"""Per-user (or per-IP) sliding-window rate limit for the expensive endpoints, active only in ``saas``.

The client IP is ``request.client.host``: behind Caddy, uvicorn's ``--proxy-headers`` rewrites it from
``X-Forwarded-For`` (``FORWARDED_ALLOW_IPS`` in ``deploy/docker-compose.yml``); Caddy overwrites any
``X-Forwarded-For`` the client sent, so it cannot be spoofed. Without a proxy the header is ignored.
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import Depends, Request

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.exceptions import RateLimitError
from app.models.user import User


class SlidingWindowLimiter:
    """shortcut: en memoria, un solo worker; pasar a Redis si hay varios workers."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._lock = threading.Lock()  # sync routes run in a thread pool

    def hit(self, bucket: str, key: str, *, limit: int, window_seconds: int) -> None:
        now = self._clock()
        with self._lock:
            hits = self._hits.setdefault((bucket, key), deque())
            while hits and hits[0] <= now - window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                raise RateLimitError(max(1, math.ceil(hits[0] + window_seconds - now)))
            hits.append(now)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def _active() -> bool:
    settings = get_settings()
    return settings.is_saas and settings.RATE_LIMIT_ENABLED


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, limit: int, window_seconds: int) -> Callable[..., None]:
    """Dependency keyed by the signed-in user (resolved once per request by FastAPI's cache)."""

    def dependency(user: User = Depends(get_current_user)) -> None:
        if _active():
            limiter.hit(bucket, f"user:{user.id}", limit=limit, window_seconds=window_seconds)

    return dependency


def rate_limit_by_ip(bucket: str, limit: int, window_seconds: int) -> Callable[..., None]:
    """Same, keyed by client IP: for public endpoints with no user."""

    def dependency(request: Request) -> None:
        if _active():
            limiter.hit(bucket, f"ip:{_client_ip(request)}", limit=limit, window_seconds=window_seconds)

    return dependency
