"""Reusable column mixins."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    """Adds a ``created_at`` column populated on insert (UTC)."""

    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)
