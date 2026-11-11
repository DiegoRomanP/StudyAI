"""Adaptive assessment endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.adaptive_learning import (
    AssessmentResponseV2, AssessmentResultV2, AssessmentSubmissionV2,
)
from app.services.adaptive_quiz_service import AdaptiveQuizService

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


@router.get(
    "/{session_id}/assessment-v2",
    response_model=AssessmentResponseV2,
    responses={
        404: {"description": "Sesión no encontrada"},
        409: {"description": "CONTENT_VERSION_MISMATCH o CONTENT_NOT_READY"},
    },
)
def get_assessment_v2(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssessmentResponseV2:
    return AdaptiveQuizService(db).get_assessment(user.id, session_id)


@router.post(
    "/{quiz_id}/assessment-v2/submit",
    response_model=AssessmentResultV2,
    responses={
        400: {"description": "Respuestas inválidas o incompletas"},
        404: {"description": "Quiz no encontrado"},
        409: {"description": "Versión, contenido, revisión o estado de entrega en conflicto"},
    },
)
def submit_assessment_v2(
    quiz_id: int,
    submission: AssessmentSubmissionV2,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssessmentResultV2:
    return AdaptiveQuizService(db).submit(user.id, quiz_id, submission)


@router.get(
    "/{session_id}/assessment-v2/result",
    response_model=AssessmentResultV2,
    responses={
        404: {"description": "Sesión o resultado no encontrado"},
        409: {"description": "CONTENT_VERSION_MISMATCH o CONTENT_NOT_READY"},
    },
)
def get_assessment_result_v2(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssessmentResultV2:
    return AdaptiveQuizService(db).latest_result(user.id, session_id)
