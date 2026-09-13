"""Database bootstrap.

For the MVP we create tables directly from the ORM metadata so the app runs with
zero migration steps. Alembic is still configured (see ``alembic.ini``) for when
the schema stabilises and you want versioned migrations.
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.api.deps import DEFAULT_USER_EMAIL, DEFAULT_USER_ID
from app.core.logging import get_logger
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.user import User

logger = get_logger(__name__)


def init_db() -> None:
    """Create all tables and seed the default (demo) user."""
    Base.metadata.create_all(bind=engine)
    _ensure_document_error_message_column()
    _ensure_llm_verification_columns()
    _seed_default_user()


def _ensure_document_error_message_column() -> None:
    """Additive backfill for DBs created before ``Document.error_message`` existed.

    ``create_all`` only creates missing tables, never alters existing ones, so a
    pre-existing SQLite file needs this column added by hand. No-op once present.
    """
    columns = {c["name"] for c in inspect(engine).get_columns("documents")}
    if "error_message" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE documents ADD COLUMN error_message VARCHAR(1024) DEFAULT ''"))
        logger.info("Migrated documents table: added error_message column")


def _ensure_llm_verification_columns() -> None:
    """Backfill verification state for installations created before IA-01.

    A historical model name is not evidence that its current key/model/URL was
    successfully tested, so legacy active credentials are made inactive once.
    """
    tables = inspect(engine).get_table_names()
    if "llm_credentials" not in tables:
        return

    columns = {column["name"] for column in inspect(engine).get_columns("llm_credentials")}
    additions = {
        "config_revision": "INTEGER NOT NULL DEFAULT 1",
        "verified_revision": "INTEGER",
        "verified_at": "DATETIME",
        "verified_fingerprint": "VARCHAR(64)",
    }
    with engine.begin() as conn:
        for name, definition in additions.items():
            if name not in columns:
                conn.execute(text(f"ALTER TABLE llm_credentials ADD COLUMN {name} {definition}"))
                logger.info("Migrated llm_credentials table: added %s column", name)
        conn.execute(
            text(
                "UPDATE llm_credentials SET is_active = 0 "
                "WHERE is_active = 1 AND verified_revision IS NULL"
            )
        )


def _seed_default_user() -> None:
    db = SessionLocal()
    try:
        if db.get(User, DEFAULT_USER_ID) is None:
            db.add(User(id=DEFAULT_USER_ID, email=DEFAULT_USER_EMAIL))
            db.commit()
            logger.info("Seeded default user id=%s", DEFAULT_USER_ID)
    finally:
        db.close()
