"""Just-in-time user provisioning for verified Supabase identities."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import AuthClaims
from app.core.config import get_settings
from app.core.disposable_domains import is_disposable_email, normalize_email
from app.core.exceptions import ConflictError
from app.models.credit_ledger import CreditReason, CreditSource
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services.credit_service import CreditService

SIGNUP_BONUS_CREDITS = 3


def on_user_created(db: Session, user: User) -> None:
    """Hook run once when a user is first provisioned: in saas, grants the 3 welcome credits.

    The Supabase token already means a verified email (D2). Throwaway domains get nothing, and the
    key is per normalized inbox so ``a+1@x`` / ``a.b@gmail`` aliases cannot farm the gift.
    """
    if not get_settings().is_saas or is_disposable_email(user.email):
        return
    CreditService(db).grant(
        user.id, delta=SIGNUP_BONUS_CREDITS, reason=CreditReason.SIGNUP_BONUS, source=CreditSource.PURCHASED,
        idempotency_key=f"signup_bonus:{normalize_email(user.email)}",
    )


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
