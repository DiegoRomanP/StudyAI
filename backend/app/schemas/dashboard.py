"""Dashboard DTOs."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class ScorePoint(BaseModel):
    """
    modelo de puntajes para mejorar

    Un punto por envío de quiz con preguntas de opción múltiple; ``completed_at``
    es el momento de ese envío. Los envíos solo de flashcards no tienen puntaje.
    """

    session_id: int
    topic_name: str
    score: float
    completed_at: datetime | None


class WeakTopic(BaseModel):
    """
    tema que aun no se domina,
    """

    topic_name: str
    score: float


class UpcomingReview(BaseModel):
    next_review_date: date
    count: int


class DashboardResponse(BaseModel):
    """``sessions_completed`` cuenta sesiones distintas en estado COMPLETED;
    ``average_score`` promedia ``scores``."""

    scores: list[ScorePoint]
    weak_topics: list[WeakTopic]
    upcoming_reviews: list[UpcomingReview]
    sessions_completed: int
    average_score: float
