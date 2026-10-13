"""Plan and PlanTopic entities.

A Plan is generated asynchronously from a Goal + a set of Documents. It owns an
ordered list of study Sessions (see ``session.py``) and the topics the LLM
identified (with a Pareto-selected subset flagged via ``selected``).
"""

from __future__ import annotations

import enum

from sqlalchemy import Enum, Float, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class PlanStatus(str, enum.Enum):
    PROCESSING = "PROCESSING"    # background generation in progress
    READY = "READY"              # sessions + materials available
    FAILED = "FAILED"


class Plan(TimestampMixin, Base):
    __tablename__ = "plans"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_plans_user_idempotency_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="Plan de estudio")
    status: Mapped[PlanStatus] = mapped_column(
        Enum(PlanStatus), default=PlanStatus.PROCESSING, index=True
    )
    # Source documents used for retrieval. JSON list of document ids keeps the
    # MVP schema simple without an extra association table.
    document_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    error_message: Mapped[str] = mapped_column(String(1024), default="")
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    idempotency_request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    goal = relationship("Goal")
    topics = relationship(
        "PlanTopic",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="PlanTopic.relevance.desc()",
    )
    sessions = relationship(
        "Session",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="Session.order_index",
    )


class PlanTopic(Base):
    __tablename__ = "plan_topics"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    subtopics: Mapped[list[str]] = mapped_column(JSON, default=list)
    difficulty: Mapped[int] = mapped_column(Integer, default=3)   # 1..5
    relevance: Mapped[float] = mapped_column(Float, default=0.5)  # 0..1
    selected: Mapped[bool] = mapped_column(default=False)         # survived Pareto filter

    plan = relationship("Plan", back_populates="topics")
