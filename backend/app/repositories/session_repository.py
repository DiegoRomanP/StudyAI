"""Session persistence."""

from __future__ import annotations

from app.models.session import Session as StudySession
from app.repositories.base import BaseRepository


class SessionRepository(BaseRepository[StudySession]):
    model = StudySession
