"""Goal persistence."""

from __future__ import annotations

from sqlalchemy import select

from app.models.goal import Goal
from app.repositories.base import BaseRepository


class GoalRepository(BaseRepository[Goal]):
    model = Goal

    def list_for_user(self, user_id: int) -> list[Goal]:
        stmt = select(Goal).where(Goal.user_id == user_id).order_by(Goal.created_at.desc())
        return list(self.db.execute(stmt).scalars().all())
