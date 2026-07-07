"""Plan endpoints — asynchronous AI generation."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.plan import (
    PlanGenerateRequest,
    PlanResponse,
    PlanStatusResponse,
)
from app.services.plan_service import PlanService, generate_plan_task

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post(
    "/generate",
    response_model=PlanStatusResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_plan(
    payload: PlanGenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlanStatusResponse:
    service = PlanService(db)
    plan = service.create_plan(user.id, payload.goal_id, payload.document_ids)
    background_tasks.add_task(generate_plan_task, plan.id)
    return PlanStatusResponse.model_validate(plan)


@router.get("", response_model=list[PlanResponse])
def list_plans(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PlanResponse]:
    service = PlanService(db)
    return [PlanResponse.model_validate(p) for p in service.list_plans(user.id)]


@router.get("/{plan_id}/status", response_model=PlanStatusResponse)
def get_plan_status(
    plan_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlanStatusResponse:
    service = PlanService(db)
    return PlanStatusResponse.model_validate(service.get_plan(user.id, plan_id))


@router.get("/{plan_id}", response_model=PlanResponse)
def get_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlanResponse:
    service = PlanService(db)
    return PlanResponse.model_validate(service.get_plan(user.id, plan_id))
