"""Plan and PlanTopic entities.

A Plan is generated asynchronously from a Goal + a set of Documents. It owns an
ordered list of study Sessions (see ``session.py``) and the topics the LLM
identified (with a Pareto-selected subset flagged via ``selected``).
"""

from __future__ import annotations

import enum
from datetime import date

from sqlalchemy import Date, Enum, Float, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class PlanStatus(str, enum.Enum):
    PROCESSING = "PROCESSING"    # background generation in progress
    READY = "READY"              # sessions + materials available
    FAILED = "FAILED"


class GenerationStage(str, enum.Enum):
    TOPICS = "TOPICS"        # reading the material and detecting topics
    SESSIONS = "SESSIONS"    # selecting key topics and laying out sessions
    CONTENT = "CONTENT"      # preparing each session's material and quiz


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
    progress_stage: Mapped[GenerationStage | None] = mapped_column(
        Enum(GenerationStage, native_enum=False, length=16), nullable=True
    )
    progress_done: Mapped[int] = mapped_column(Integer, default=0)
    progress_total: Mapped[int] = mapped_column(Integer, default=0)
    # UTC day a free-AI use was spent on this plan; cleared once it is refunded or the plan is READY.
    free_ai_use_date: Mapped[date | None] = mapped_column(Date, nullable=True)

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
    mastery: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0..1, None = no data
    review_box: Mapped[int] = mapped_column(Integer, default=0)   # step of the review ladder

    plan = relationship("Plan", back_populates="topics")
