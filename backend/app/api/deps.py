"""Shared FastAPI dependencies.

The MVP is single-user: a default user is seeded at startup and returned by
``get_current_user``. The dependency boundary is in place so real authentication
(JWT/session) can be dropped in later without touching route handlers.
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.auth import SupabaseTokenVerifier
from app.core.config import get_settings
from app.core.exceptions import AuthenticationError, NotFoundError
from app.db.session import get_db
from app.models.user import User
from app.services.user_service import get_or_create_supabase_user

DEFAULT_USER_ID = 1
DEFAULT_USER_EMAIL = "demo@studyai.local"

_bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_token_verifier() -> SupabaseTokenVerifier:
    s = get_settings()
    return SupabaseTokenVerifier(
        jwks_url=s.SUPABASE_JWKS_URL,
        issuer=f"{s.SUPABASE_URL.rstrip('/')}/auth/v1",
        audience=s.SUPABASE_JWT_AUDIENCE,
    )


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
    verifier: SupabaseTokenVerifier = Depends(get_token_verifier),
) -> User:
    if get_settings().AUTH_MODE == "supabase":
        if creds is None:
            raise AuthenticationError("Inicia sesión para continuar.", "AUTH_REQUIRED")
        return get_or_create_supabase_user(db, verifier.verify(creds.credentials))
    user = db.get(User, DEFAULT_USER_ID)
    if user is None:
        # Self-heal in case the seed was skipped.
        user = User(id=DEFAULT_USER_ID, email=DEFAULT_USER_EMAIL)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def require_self_hosted() -> None:
    """404 in SaaS: bring-your-own-key and Ollama do not exist there (the UI hides them too)."""
    if get_settings().is_saas:
        raise NotFoundError("No encontrado.")
