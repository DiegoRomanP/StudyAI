"""Daily counter of the included free-tier AI uses, one row per user and day."""

from __future__ import annotations

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FreeAiUsage(Base):
    __tablename__ = "free_ai_usage"
    __table_args__ = (UniqueConstraint("user_id", "usage_date", name="uq_free_ai_usage_user_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)
    uses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
