"""Session DTOs."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SessionMaterialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content_markdown: str
    youtube_keywords: list[str]


class ReviewPointResponse(BaseModel):
    prompt: str
    answer: str


class SessionDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plan_id: int
    order_index: int
    topic_name: str
    duration_minutes: int
    review_offset_days: int
    status: str
    completed_at: datetime | None
    material: SessionMaterialResponse | None = None
    kind: str = "NEW"
    topic_id: int | None = None
    scheduled_date: date | None = None
    review_points: list[ReviewPointResponse] = Field(default_factory=list)
    reinforcement_status: str = "NONE"
    reinforcement_error: str = ""

    @field_validator("review_points", mode="before")
    @classmethod
    def _none_is_empty(cls, value):
        return [] if value is None else value
