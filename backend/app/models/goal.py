"""Goal entity: what the learner is trying to achieve."""

from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import Date, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class GoalType(str, enum.Enum):
    """Drives the Strategy used when generating a plan."""

    EXAM = "EXAM"                    # "Sacar buena nota"
    LEARNING = "LEARNING"            # "Solo quiero aprender"
    MEMORIZATION = "MEMORIZATION"    # "Necesito memorizar"


class Goal(TimestampMixin, Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    goal_type: Mapped[GoalType] = mapped_column(Enum(GoalType), default=GoalType.LEARNING)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    # Optional exam day (no time). Only stored and shown; it does not feed plan generation.
    exam_date: Mapped[date | None] = mapped_column(Date, default=None, nullable=True)
    # Soft delete: the learner's plans, sessions and practice outlive the goal, and
    # generation, resume and reinforcement still read its title and type.
    deleted_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
