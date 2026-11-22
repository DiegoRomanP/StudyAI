"""One message of the study assistant chat (the learner's question or the assistant's reply)."""

from __future__ import annotations

import enum

from sqlalchemy import Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class AssistantMode(str, enum.Enum):
    STUDY = "STUDY"  # reading: explains doubts
    EXAM = "EXAM"    # test: hints only, never the answer


class AssistantRole(str, enum.Enum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"


class AssistantMessage(TimestampMixin, Base):
    __tablename__ = "assistant_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # No FK on plan/session: delete_plan removes these rows explicitly (SQLite never cascades here).
    plan_id: Mapped[int] = mapped_column(Integer, index=True)
    session_id: Mapped[int] = mapped_column(Integer, index=True)
    mode: Mapped[AssistantMode] = mapped_column(Enum(AssistantMode, name="assistant_mode"))
    role: Mapped[AssistantRole] = mapped_column(Enum(AssistantRole, name="assistant_role"))
    content: Mapped[str] = mapped_column(Text)
