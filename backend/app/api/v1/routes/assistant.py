"""Study assistant endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.assistant import (
    AssistantAskRequest,
    AssistantAskResponse,
    AssistantHistoryResponse,
    AssistantQuestionItem,
)
from app.services.assistant_service import AssistantService

router = APIRouter(tags=["assistant"])


@router.get("/sessions/{session_id}/assistant", response_model=AssistantHistoryResponse)
def get_assistant_history(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssistantHistoryResponse:
    return AssistantService(db).history(user.id, session_id)


@router.post(
    "/sessions/{session_id}/assistant", response_model=AssistantAskResponse,
    dependencies=[Depends(rate_limit("assistant", limit=60, window_seconds=3600))],
)
def ask_assistant(
    session_id: int,
    payload: AssistantAskRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssistantAskResponse:
    return AssistantService(db).ask(user.id, session_id, payload)


@router.get("/assistant/questions", response_model=list[AssistantQuestionItem])
def list_assistant_questions(
    plan_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[AssistantQuestionItem]:
    return AssistantService(db).questions(user.id, plan_id)
