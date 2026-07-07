"""SQLAlchemy engine, session factory and FastAPI dependency."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_settings = get_settings()

# SQLite needs check_same_thread=False to be used across FastAPI's threadpool.
_connect_args = (
    {"check_same_thread": False} if _settings.DATABASE_URL.startswith("sqlite") else {}
)

engine = create_engine(
    _settings.DATABASE_URL,
    connect_args=_connect_args,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)


def get_db() -> Iterator[Session]:
    """Yield a request-scoped session, guaranteed to close afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
