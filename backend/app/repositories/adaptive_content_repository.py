"""Persistence for the versioned content layered onto existing session rows."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.quiz import Quiz
from app.models.session import Session as StudySession, SessionMaterial
from app.pedagogy.contracts import AdaptiveSessionDraft


class AdaptiveContentRepository:
    """Read and update v2 fields without replacing existing v1 content."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def save(self, session_id: int, content: AdaptiveSessionDraft) -> None:
        """Persist validated adaptive fields on already-created session content.

        Session material and quiz rows are created by the existing generation
        path. Requiring them here keeps this repository from creating competing
        versions of shared v1 records or replacing their contents.
        """
        draft = AdaptiveSessionDraft.model_validate(content)
        study_session = self.db.get(StudySession, session_id)
        if study_session is None:
            raise ValueError("Adaptive content requires an existing session.")

        material = self.db.execute(
            select(SessionMaterial).where(SessionMaterial.session_id == session_id)
        ).scalars().first()
        quiz = self.db.execute(select(Quiz).where(Quiz.session_id == session_id)).scalars().first()
        if material is None or quiz is None:
            raise ValueError("Adaptive content requires existing material and quiz rows.")

        material.pedagogy_snapshot = draft.pedagogy_snapshot.model_dump(mode="json")
        material.lesson_blocks = [block.model_dump(mode="json") for block in draft.lesson_blocks]
        quiz.adaptive_assessment = draft.adaptive_assessment.model_dump(mode="json")
        quiz.assessment_revision = draft.assessment_revision
        quiz.assessment_state = draft.assessment_state
        self.db.flush()

    def get(self, session_id: int) -> AdaptiveSessionDraft | None:
        """Return a fully validated v2 draft, or ``None`` for v1/incomplete data."""
        study_session = self.db.get(StudySession, session_id)
        if study_session is None:
            return None

        material = self.db.execute(
            select(SessionMaterial).where(SessionMaterial.session_id == session_id)
        ).scalars().first()
        quiz = self.db.execute(select(Quiz).where(Quiz.session_id == session_id)).scalars().first()
        if (
            material is None
            or quiz is None
            or material.pedagogy_snapshot is None
            or material.lesson_blocks is None
            or quiz.adaptive_assessment is None
        ):
            return None

        return AdaptiveSessionDraft.model_validate(
            {
                "pedagogy_snapshot": material.pedagogy_snapshot,
                "lesson_blocks": material.lesson_blocks,
                "adaptive_assessment": quiz.adaptive_assessment,
                "assessment_revision": quiz.assessment_revision,
                "assessment_state": quiz.assessment_state,
            }
        )
