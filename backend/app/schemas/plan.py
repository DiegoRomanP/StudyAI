"""Plan DTOs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.plan import PlanStatus


class PlanGenerateRequest(BaseModel):
    goal_id: int
    document_ids: list[int] = Field(default_factory=list)


class PlanTopicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    subtopics: list[str]
    difficulty: int
    relevance: float
    selected: bool


class SessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int
    topic_name: str
    duration_minutes: int
    review_offset_days: int
    status: str


class PlanStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: PlanStatus
    error_message: str = ""


class PlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: PlanStatus
    goal_id: int
    document_ids: list[int]
    created_at: datetime
    error_message: str = ""
    topics: list[PlanTopicResponse] = Field(default_factory=list)
    sessions: list[SessionSummary] = Field(default_factory=list)
