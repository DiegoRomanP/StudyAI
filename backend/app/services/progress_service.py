"""Progress tracking: SM-2 updates on session completion + dashboard queries."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.algorithms.sm2 import calculate_next_review
from app.core.logging import get_logger
from app.events.session_events import (
    SESSION_COMPLETED,
    SessionCompletedEvent,
    event_bus,
)
from app.models.flashcard import FlashcardReview
from app.models.plan import Plan
from app.models.quiz import QuizResult
from app.models.session import Session as StudySession
from app.models.session import SessionStatus
from app.repositories.quiz_repository import FlashcardReviewRepository
from app.schemas.dashboard import (
    DashboardResponse,
    ScorePoint,
    UpcomingReview,
    WeakTopic,
)

logger = get_logger(__name__)


def handle_session_completed(event: SessionCompletedEvent) -> None:
    """SM-2 handler subscribed to ``session.completed``.

    Updates (or creates) a FlashcardReview per rated flashcard using the
    learner's quality rating. Flushes into the caller's transaction — the caller
    owns the commit.
    """
    db = event.db
    repo = FlashcardReviewRepository(db)
    for question_id, quality in event.flashcard_qualities.items():
        review = repo.find_for_question(event.user_id, question_id)
        if review is None:
            review = FlashcardReview(user_id=event.user_id, question_id=question_id)
            db.add(review)
            # Flush so SQLAlchemy applies the column defaults (EF=2.5, etc.);
            # they are otherwise None until INSERT and SM-2 would fail.
            db.flush()

        result = calculate_next_review(
            easiness_factor=review.easiness_factor,
            interval_days=review.interval_days,
            repetition_count=review.repetition_count,
            quality=int(quality),
        )
        review.easiness_factor = result.new_ef
        review.interval_days = result.new_interval
        review.repetition_count = result.new_repetition_count
        review.next_review_date = result.next_review_date
        review.last_quality = int(quality)
    db.flush()


def register_handlers() -> None:
    """Wire the SM-2 handler to the event bus (called once at startup)."""
    event_bus.subscribe(SESSION_COMPLETED, handle_session_completed)


class ProgressService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def dashboard(self, user_id: int) -> DashboardResponse:
        scores = self._score_history(user_id)
        weak = sorted(
            (WeakTopic(topic_name=s.topic_name, score=s.score) for s in scores),
            key=lambda w: w.score,
        )[:5]
        upcoming = self._upcoming_reviews(user_id)
        avg = round(sum(s.score for s in scores) / len(scores), 1) if scores else 0.0
        return DashboardResponse(
            scores=scores,
            weak_topics=weak,
            upcoming_reviews=upcoming,
            sessions_completed=self._completed_session_count(user_id),
            average_score=avg,
        )

    def _completed_session_count(self, user_id: int) -> int:
        """Distinct completed sessions — a re-submitted quiz is still one session."""
        stmt = (
            select(func.count(StudySession.id))
            .join(Plan, StudySession.plan_id == Plan.id)
            .where(Plan.user_id == user_id, StudySession.status == SessionStatus.COMPLETED)
        )
        return int(self.db.execute(stmt).scalar_one())

    def _score_history(self, user_id: int) -> list[ScorePoint]:
        stmt = (
            select(QuizResult, StudySession)
            .join(StudySession, QuizResult.session_id == StudySession.id)
            .join(Plan, StudySession.plan_id == Plan.id)
            .where(Plan.user_id == user_id)
            .order_by(QuizResult.created_at.asc())
        )
        rows = self.db.execute(stmt).all()
        return [
            ScorePoint(
                session_id=session.id,
                topic_name=session.topic_name,
                score=result.score,
                # The result's own timestamp: a later re-submission must not move earlier points.
                completed_at=result.created_at or session.completed_at,
            )
            for result, session in rows
            if _has_multiple_choice(result)
        ]

    def _upcoming_reviews(self, user_id: int) -> list[UpcomingReview]:
        repo = FlashcardReviewRepository(self.db)
        reviews = repo.upcoming_for_user(user_id, limit=200)
        by_date: Counter = Counter(r.next_review_date for r in reviews)
        return [
            UpcomingReview(next_review_date=day, count=count)
            for day, count in sorted(by_date.items())
        ][:14]


def _has_multiple_choice(result: QuizResult) -> bool:
    """Only multiple-choice answers are graded; flashcard ratings feed SM-2, not the score."""
    detail = result.detail or {}
    return any(
        isinstance(entry, dict) and entry.get("type") == "multiple_choice"
        for entry in detail.values()
    )


# Utility used by the seed / demo flows.
def _utcnow() -> datetime:
    return datetime.now(timezone.utc)
