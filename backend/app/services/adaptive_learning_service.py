"""Version-specific reads for adaptive session content."""

from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError
from app.models.session import Session as StudySession
from app.pedagogy.contracts import AdaptiveSessionDraft
from app.repositories.adaptive_content_repository import AdaptiveContentRepository
from app.schemas.adaptive_learning import LearningModeResponse, LearningResponseV2
from app.services.session_service import SessionService, require_content_version


class AdaptiveLearningService:
    def __init__(self, db: Session) -> None:
        self.sessions = SessionService(db)
        self.content = AdaptiveContentRepository(db)

    def get_mode(self, user_id: int, session_id: int) -> LearningModeResponse:
        session = self.sessions.get_session(user_id, session_id)
        return LearningModeResponse(content_version=session.plan.content_version)

    def get_learning(self, user_id: int, session_id: int) -> LearningResponseV2:
        session = self.sessions.get_session(user_id, session_id)
        draft = self.require_published_content(session)
        return LearningResponseV2(
            session_id=session.id,
            snapshot=draft.pedagogy_snapshot,
            lesson_blocks=draft.lesson_blocks,
            content_markdown=session.material.content_markdown,
            stimuli=draft.adaptive_assessment.stimuli,
        )

    def require_published_content(self, session: StudySession) -> AdaptiveSessionDraft:
        require_content_version(session, 2)
        try:
            draft = self.content.get(session.id)
        except PydanticValidationError:
            draft = None
        if draft is None or not draft.assessment_revision or draft.assessment_state is None:
            raise ConflictError(
                "El contenido de la sesión todavía no está disponible.", "CONTENT_NOT_READY"
            )
        return draft
