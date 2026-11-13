"""Study assistant DTOs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.assistant_message import AssistantMode, AssistantRole


class AssistantAskRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    mode: AssistantMode = AssistantMode.STUDY
    # EXAM: the question on screen (a quiz question id, or a v2 "legacy:N"/adaptive id).
    question_id: str | None = Field(default=None, max_length=64)


class AssistantMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: AssistantRole
    mode: AssistantMode
    content: str
    created_at: datetime


class AssistantHistoryResponse(BaseModel):
    messages: list[AssistantMessageResponse]
    # Free-AI messages left today; null when the learner's own AI (or the mock) answers.
    remaining: int | None = None


class AssistantAskResponse(BaseModel):
    question: AssistantMessageResponse
    answer: AssistantMessageResponse
    remaining: int | None = None


class AssistantQuestionItem(BaseModel):
    id: int
    plan_id: int
    plan_title: str
    session_id: int
    topic_name: str
    mode: AssistantMode
    question: str
    answer: str
    created_at: datetime
