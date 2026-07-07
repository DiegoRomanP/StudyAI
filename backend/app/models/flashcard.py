"""Spaced-repetition scheduling state for a single flashcard question (SM-2)."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Date, Float, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _today() -> date:
    return datetime.now(timezone.utc).date()


class FlashcardReview(Base):
    """One row per (user, flashcard question) tracking the SM-2 schedule."""

    __tablename__ = "flashcard_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("quiz_questions.id", ondelete="CASCADE"), index=True
    )

    easiness_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    repetition_count: Mapped[int] = mapped_column(Integer, default=0)
    next_review_date: Mapped[date] = mapped_column(Date, default=_today)
    last_quality: Mapped[int] = mapped_column(Integer, default=0)

    question = relationship("QuizQuestion")
