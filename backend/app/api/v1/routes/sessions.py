"""Study session endpoints."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.session import SessionDetailResponse
from app.services.reinforcement_service import ReinforcementService, generate_reinforcement_task
from app.services.session_service import SessionService

router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionCompleteRequest(BaseModel):
    # question_id -> SM-2 quality (0..5) for any flashcards rated during study.
    flashcard_qualities: dict[int, int] = Field(default_factory=dict)


@router.get("/{session_id}", response_model=SessionDetailResponse)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SessionDetailResponse:
    service = SessionService(db)
    return SessionDetailResponse.model_validate(service.get_session(user.id, session_id))


@router.post("/{session_id}/complete", response_model=SessionDetailResponse)
def complete_session(
    session_id: int,
    payload: SessionCompleteRequest | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SessionDetailResponse:
    service = SessionService(db)
    qualities = payload.flashcard_qualities if payload else {}
    session = service.complete_session(user.id, session_id, qualities)
    return SessionDetailResponse.model_validate(session)


@router.post(
    "/{session_id}/reinforcement",
    response_model=SessionDetailResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def start_reinforcement(
    session_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SessionDetailResponse:
    session, start_task, spent = ReinforcementService(db).start(user.id, session_id)
    if start_task:
        background_tasks.add_task(generate_reinforcement_task, session.id, user.id, spent)
    return SessionDetailResponse.model_validate(session)


@router.post("/{session_id}/reinforcement/cancel", response_model=SessionDetailResponse)
def cancel_reinforcement(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SessionDetailResponse:
    return SessionDetailResponse.model_validate(ReinforcementService(db).cancel(user.id, session_id))
