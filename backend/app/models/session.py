"""Study Session and its generated material."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class SessionStatus(str, enum.Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"


class Session(TimestampMixin, Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), index=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    topic_name: Mapped[str] = mapped_column(String(255))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=25)
    # Ebbinghaus offset in days from plan creation (1, 3, 7, 14, 30...).
    review_offset_days: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus), default=SessionStatus.PENDING
    )
    completed_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)

    plan = relationship("Plan", back_populates="sessions")
    material = relationship(
        "SessionMaterial",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
    )
    quiz = relationship(
        "Quiz",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
    )


class SessionMaterial(Base):
    __tablename__ = "session_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    content_markdown: Mapped[str] = mapped_column(Text, default="")
    # Keywords the frontend turns into YouTube *search* URLs (never raw LLM URLs).
    youtube_keywords: Mapped[list[str]] = mapped_column(JSON, default=list)

    session = relationship("Session", back_populates="material")
