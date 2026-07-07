"""Quiz endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.quiz import QuizResponse, QuizResultResponse, QuizSubmission
from app.services.quiz_service import QuizService

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


@router.get("/{session_id}", response_model=QuizResponse)
def get_quiz(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QuizResponse:
    service = QuizService(db)
    return QuizResponse.model_validate(service.get_quiz_for_session(user.id, session_id))


@router.post("/{quiz_id}/submit", response_model=QuizResultResponse)
def submit_quiz(
    quiz_id: int,
    submission: QuizSubmission,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QuizResultResponse:
    service = QuizService(db)
    return service.submit(user.id, quiz_id, submission)
