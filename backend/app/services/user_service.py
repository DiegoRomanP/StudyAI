"""Just-in-time user provisioning for verified Supabase identities."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import AuthClaims
from app.core.exceptions import ConflictError
from app.models.user import User
from app.repositories.user_repository import UserRepository


def on_user_created(db: Session, user: User) -> None:
    """Hook run once when a user is first provisioned (F1 grants the welcome credits here)."""


def get_or_create_supabase_user(db: Session, claims: AuthClaims) -> User:
    repo = UserRepository(db)
    user = repo.find_by_supabase_id(claims.sub)
    if user is not None:
        return user
    if repo.find_by_email(claims.email) is not None:
        raise ConflictError("Ese correo ya pertenece a otra cuenta.", "AUTH_EMAIL_CONFLICT")
    user = User(email=claims.email, supabase_user_id=claims.sub, email_verified_at=datetime.now(timezone.utc))
    try:
        repo.save(user)
    except IntegrityError:
        # A concurrent first request won the race: reuse its row, or report the email clash.
        db.rollback()
        user = repo.find_by_supabase_id(claims.sub)
        if user is None:
            raise ConflictError("Ese correo ya pertenece a otra cuenta.", "AUTH_EMAIL_CONFLICT") from None
        return user
    on_user_created(db, user)
    return user
