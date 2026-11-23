"""User persistence."""

from __future__ import annotations

from sqlalchemy import select

from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    def find_by_supabase_id(self, sub: str) -> User | None:
        return self.db.execute(select(User).where(User.supabase_user_id == sub)).scalar_one_or_none()

    def find_by_email(self, email: str) -> User | None:
        return self.db.execute(select(User).where(User.email == email)).scalar_one_or_none()
