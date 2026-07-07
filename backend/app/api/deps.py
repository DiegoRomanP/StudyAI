"""Shared FastAPI dependencies.

The MVP is single-user: a default user is seeded at startup and returned by
``get_current_user``. The dependency boundary is in place so real authentication
(JWT/session) can be dropped in later without touching route handlers.
"""

from __future__ import annotations

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User

DEFAULT_USER_ID = 1
DEFAULT_USER_EMAIL = "demo@studyai.local"


def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.get(User, DEFAULT_USER_ID)
    if user is None:
        # Self-heal in case the seed was skipped.
        user = User(id=DEFAULT_USER_ID, email=DEFAULT_USER_EMAIL)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
