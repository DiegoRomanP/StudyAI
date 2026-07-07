"""Session DTOs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SessionMaterialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content_markdown: str
    youtube_keywords: list[str]


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
