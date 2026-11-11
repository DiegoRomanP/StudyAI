"""Adaptive session learning endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.adaptive_learning import LearningModeResponse, LearningResponseV2
from app.services.adaptive_learning_service import AdaptiveLearningService

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get(
    "/{session_id}/learning-mode",
    response_model=LearningModeResponse,
    responses={404: {"description": "Sesión no encontrada"}},
)
def get_learning_mode(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LearningModeResponse:
    return AdaptiveLearningService(db).get_mode(user.id, session_id)


@router.get(
    "/{session_id}/learning-v2",
    response_model=LearningResponseV2,
    responses={
        404: {"description": "Sesión no encontrada"},
        409: {"description": "CONTENT_VERSION_MISMATCH o CONTENT_NOT_READY"},
    },
)
def get_learning_v2(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LearningResponseV2:
    return AdaptiveLearningService(db).get_learning(user.id, session_id)
