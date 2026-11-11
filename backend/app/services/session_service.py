"""Study session lifecycle."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.events.session_events import (
    SESSION_COMPLETED,
    SessionCompletedEvent,
    event_bus,
)
from app.models.session import Session as StudySession
from app.models.session import SessionStatus
from app.repositories.session_repository import SessionRepository
from app.schemas.session import SessionDetailResponse


def require_content_version(session: StudySession, expected: Literal[1, 2]) -> None:
    if session.plan.content_version != expected:
        raise ConflictError("Esta sesión usa otra versión de contenido.", "CONTENT_VERSION_MISMATCH")


class SessionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = SessionRepository(db)

    def get_session(self, user_id: int, session_id: int) -> StudySession:
        session = self.repo.find_by_id(session_id)
        if session is None or session.plan is None or session.plan.user_id != user_id:
            raise NotFoundError("Sesión no encontrada.")
        return session

    @staticmethod
    def detail_response(session: StudySession) -> SessionDetailResponse:
        return SessionDetailResponse.model_validate(
            session, context={"hide_review_points": session.plan.content_version == 2}
        )

    def complete_session(
        self,
        user_id: int,
        session_id: int,
        flashcard_qualities: dict[int, int] | None = None,
    ) -> StudySession:
        session = self.get_session(user_id, session_id)
        require_content_version(session, 1)
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
