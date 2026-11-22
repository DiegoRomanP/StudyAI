"""Goal persistence."""

from __future__ import annotations

from sqlalchemy import select

from app.models.goal import Goal
from app.repositories.base import BaseRepository


class GoalRepository(BaseRepository[Goal]):
    model = Goal

    def list_for_user(self, user_id: int) -> list[Goal]:
        stmt = (
            select(Goal)
            .where(Goal.user_id == user_id, Goal.deleted_at.is_(None))
            .order_by(Goal.created_at.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def find_active_owned(self, user_id: int, goal_id: int) -> Goal | None:
        """The caller's goal unless it was deleted (its plans keep the row alive)."""
        goal = self.find_by_id(goal_id)
        if goal is None or goal.user_id != user_id or goal.deleted_at is not None:
            return None
        return goal
