"""Plan persistence."""

from __future__ import annotations

from sqlalchemy import select

from app.models.plan import Plan
from app.repositories.base import BaseRepository


class PlanRepository(BaseRepository[Plan]):
    model = Plan

    def list_for_user(self, user_id: int) -> list[Plan]:
        stmt = select(Plan).where(Plan.user_id == user_id).order_by(Plan.created_at.desc())
        return list(self.db.execute(stmt).scalars().all())

    def list_for_goal(self, goal_id: int) -> list[Plan]:
        stmt = select(Plan).where(Plan.goal_id == goal_id)
        return list(self.db.execute(stmt).scalars().all())
