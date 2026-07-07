"""Dashboard DTOs."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class ScorePoint(BaseModel):
    session_id: int
    topic_name: str
    score: float
    completed_at: datetime | None


class WeakTopic(BaseModel):
    topic_name: str
    score: float


class UpcomingReview(BaseModel):
    next_review_date: date
    count: int


class DashboardResponse(BaseModel):
    scores: list[ScorePoint]
    weak_topics: list[WeakTopic]
    upcoming_reviews: list[UpcomingReview]
    sessions_completed: int
    average_score: float
