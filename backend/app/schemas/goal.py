"""Goal DTOs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.goal import GoalType


class GoalCreate(BaseModel):
    goal_type: GoalType = GoalType.LEARNING
    title: str = Field(min_length=1, max_length=255)
    description: str = ""


class GoalUpdate(BaseModel):
    goal_type: GoalType | None = None
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    goal_type: GoalType
    title: str
    description: str
    created_at: datetime
