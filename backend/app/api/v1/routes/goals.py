"""Goal endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.session import get_db
from app.models.goal import Goal
from app.models.user import User
from app.repositories.goal_repository import GoalRepository
from app.schemas.goal import GoalCreate, GoalResponse, GoalUpdate
from app.services.plan_service import PlanService

router = APIRouter(prefix="/goals", tags=["goals"])


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GoalResponse:
    repo = GoalRepository(db)
    goal = Goal(
        user_id=user.id,
        goal_type=payload.goal_type,
        title=payload.title,
        description=payload.description,
    )
    return GoalResponse.model_validate(repo.save(goal))


@router.get("", response_model=list[GoalResponse])
def list_goals(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[GoalResponse]:
    repo = GoalRepository(db)
    return [GoalResponse.model_validate(g) for g in repo.list_for_user(user.id)]


@router.get("/{goal_id}", response_model=GoalResponse)
def get_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GoalResponse:
    goal = _get_owned_goal(db, user.id, goal_id)
    return GoalResponse.model_validate(goal)


@router.put("/{goal_id}", response_model=GoalResponse)
def update_goal(
    goal_id: int,
    payload: GoalUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GoalResponse:
    repo = GoalRepository(db)
    goal = _get_owned_goal(db, user.id, goal_id)
    if payload.goal_type is not None:
        goal.goal_type = payload.goal_type
    if payload.title is not None:
        goal.title = payload.title
    if payload.description is not None:
        goal.description = payload.description
    return GoalResponse.model_validate(repo.save(goal))


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    goal = _get_owned_goal(db, user.id, goal_id)
    # A goal's plans reference it by goal_id but nothing cascades that
    # relationship at the ORM or DB level (see PlanService.delete_plan for
    # why) — delete them explicitly first so no plan is left pointing at a
    # goal that no longer exists.
    plan_service = PlanService(db)
    for plan in plan_service.repo.list_for_goal(goal.id):
        plan_service.delete_plan(user.id, plan.id)
    GoalRepository(db).delete(goal)


def _get_owned_goal(db: Session, user_id: int, goal_id: int) -> Goal:
    repo = GoalRepository(db)
    goal = repo.find_by_id(goal_id)
    if goal is None or goal.user_id != user_id:
        raise NotFoundError("Meta no encontrada.")
    return goal
