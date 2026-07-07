"""Study session lifecycle."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.events.session_events import (
    SESSION_COMPLETED,
    SessionCompletedEvent,
    event_bus,
)
from app.models.plan import Plan
from app.models.session import Session as StudySession
from app.models.session import SessionStatus
from app.repositories.session_repository import SessionRepository


class SessionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = SessionRepository(db)

    def get_session(self, user_id: int, session_id: int) -> StudySession:
        session = self.repo.find_by_id(session_id)
        if session is None or not self._owns(user_id, session):
            raise NotFoundError("Sesión no encontrada.")
        return session

    def complete_session(
        self,
        user_id: int,
        session_id: int,
        flashcard_qualities: dict[int, int] | None = None,
    ) -> StudySession:
        session = self.get_session(user_id, session_id)
        session.status = SessionStatus.COMPLETED
        session.completed_at = datetime.now(timezone.utc)
        self.db.add(session)
        self.db.flush()

        event_bus.publish(
            SESSION_COMPLETED,
            SessionCompletedEvent(
                session_id=session.id,
                user_id=user_id,
                db=self.db,
                flashcard_qualities=flashcard_qualities or {},
            ),
        )
        self.db.commit()
        self.db.refresh(session)
        return session

    def _owns(self, user_id: int, session: StudySession) -> bool:
        plan = self.db.get(Plan, session.plan_id)
        return plan is not None and plan.user_id == user_id
