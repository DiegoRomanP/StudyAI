"""Goal entity: what the learner is trying to achieve."""

from __future__ import annotations

import enum

from sqlalchemy import Enum, ForeignKey, String, Text
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
