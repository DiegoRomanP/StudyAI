"""Plan DTOs."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.algorithms.adaptive_route import priority as topic_priority
from app.algorithms.adaptive_route import topic_state
from app.models.plan import GenerationStage, PlanStatus


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
    mastery: float | None = None
    review_box: int = 0

    @computed_field  # type: ignore[misc]
    @property
    def mastery_state(self) -> str:
        return topic_state(self.mastery, self.review_box)

    @computed_field  # type: ignore[misc]
    @property
    def priority(self) -> float:
        return topic_priority(self.relevance, self.mastery)


class LastResultSummary(BaseModel):
    """The session's latest submitted test, for the plan's session list."""

    model_config = ConfigDict(from_attributes=True)

    score: float
    correct: int
    # Multiple-choice questions answered; 0 when the test only had flashcards.
    total: int
    created_at: datetime


class SessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int
    topic_name: str
    duration_minutes: int
    review_offset_days: int
    status: str
    kind: str = "NEW"
    topic_id: int | None = None
    scheduled_date: date | None = None
    reinforcement_status: str = "NONE"
    last_result: LastResultSummary | None = None


class PlanStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: PlanStatus
    error_message: str = ""
    progress_stage: GenerationStage | None = None
    progress_done: int = 0
    progress_total: int = 0


class PlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: PlanStatus
    goal_id: int
    document_ids: list[int]
    created_at: datetime
    error_message: str = ""
    progress_stage: GenerationStage | None = None
    progress_done: int = 0
    progress_total: int = 0
    topics: list[PlanTopicResponse] = Field(default_factory=list)
    sessions: list[SessionSummary] = Field(default_factory=list)
