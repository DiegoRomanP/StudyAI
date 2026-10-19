"""SQLAlchemy engine, session factory and FastAPI dependency."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_settings = get_settings()

_is_sqlite = _settings.DATABASE_URL.startswith("sqlite")
# SQLite needs check_same_thread=False to be used across FastAPI's threadpool; a writer
# waits up to 30 s for another one instead of failing with "database is locked".
_connect_args = {"check_same_thread": False, "timeout": 30} if _is_sqlite else {}

engine = create_engine(
    _settings.DATABASE_URL,
    connect_args=_connect_args,
    future=True,
)

if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record) -> None:
        # WAL lets the 3 s plan polling read while a generation step commits.
        # foreign_keys stays off on purpose: delete_plan cleans up reviews by hand.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

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
