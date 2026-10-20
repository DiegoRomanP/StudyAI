"""Quiz + flashcard-review persistence."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select

from app.models.flashcard import FlashcardReview
from app.models.quiz import Quiz, QuizResult
from app.repositories.base import BaseRepository


class QuizRepository(BaseRepository[Quiz]):
    model = Quiz

    def find_by_session(self, session_id: int) -> Quiz | None:
        stmt = select(Quiz).where(Quiz.session_id == session_id)
        return self.db.execute(stmt).scalars().first()

    def latest_result_for_session(self, session_id: int) -> QuizResult | None:
        stmt = (
            select(QuizResult)
            .where(QuizResult.session_id == session_id)
            .order_by(QuizResult.created_at.desc(), QuizResult.id.desc())
        )
        return self.db.execute(stmt).scalars().first()


class FlashcardReviewRepository(BaseRepository[FlashcardReview]):
    model = FlashcardReview

    def find_for_question(self, user_id: int, question_id: int) -> FlashcardReview | None:
        stmt = select(FlashcardReview).where(
            FlashcardReview.user_id == user_id,
            FlashcardReview.question_id == question_id,
        )
        return self.db.execute(stmt).scalars().first()

    def due_for_user(self, user_id: int, on_or_before: date) -> list[FlashcardReview]:
        stmt = (
            select(FlashcardReview)
            .where(
                FlashcardReview.user_id == user_id,
                FlashcardReview.next_review_date <= on_or_before,
            )
            .order_by(FlashcardReview.next_review_date.asc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def upcoming_for_user(self, user_id: int, limit: int = 20) -> list[FlashcardReview]:
        stmt = (
            select(FlashcardReview)
            .where(FlashcardReview.user_id == user_id)
            .order_by(FlashcardReview.next_review_date.asc())
            .limit(limit)
        )
        return list(self.db.execute(stmt).scalars().all())
