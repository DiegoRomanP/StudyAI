"""Quiz, QuizQuestion and QuizResult entities."""

from __future__ import annotations

import enum

from sqlalchemy import Enum, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class QuestionType(str, enum.Enum):
    FLASHCARD = "FLASHCARD"
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"


class Quiz(TimestampMixin, Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )

    session = relationship("Session", back_populates="quiz")
    questions = relationship(
        "QuizQuestion",
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="QuizQuestion.order_index",
    )
    results = relationship(
        "QuizResult",
        back_populates="quiz",
        cascade="all, delete-orphan",
    )


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), index=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    question_type: Mapped[QuestionType] = mapped_column(Enum(QuestionType))
    prompt: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text, default="")
    # For MULTIPLE_CHOICE: list of option strings; the correct one equals `answer`.
    options: Mapped[list[str]] = mapped_column(JSON, default=list)
    # Review copies point at the original question so SM-2 keeps a single schedule.
    source_question_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    quiz = relationship("Quiz", back_populates="questions")


class QuizResult(TimestampMixin, Base):
    __tablename__ = "quiz_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[float] = mapped_column(Float, default=0.0)  # 0..100 percentage
    detail: Mapped[dict] = mapped_column(JSON, default=dict)  # per-question breakdown

    quiz = relationship("Quiz", back_populates="results")
