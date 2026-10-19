"""Database bootstrap.

For the MVP we create tables directly from the ORM metadata so the app runs with
zero migration steps. Alembic is still configured (see ``alembic.ini``) for when
the schema stabilises and you want versioned migrations.
"""

from __future__ import annotations

from sqlalchemy import Index, inspect, text

from app.api.deps import DEFAULT_USER_EMAIL, DEFAULT_USER_ID
from app.core.logging import get_logger
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.llm.credential_state import verification_fingerprint
from app.models.llm_credential import LLMCredential, LLMProviderName
from app.models.plan import Plan
from app.models.user import User

logger = get_logger(__name__)


def _ensure_gemini_provider_enum_value() -> None:
    """Add Gemini to existing PostgreSQL provider enums after table creation.

    SQLAlchemy creates a missing native enum type but does not alter an existing
    type when the Python enum grows. Keep this additive backfill PostgreSQL-only;
    SQLite stores provider names as strings and needs no schema change.
    """
    if engine.dialect.name != "postgresql":
        return

    provider_enum = LLMCredential.__table__.c.provider.type
    if not provider_enum.name:
        raise RuntimeError("The LLM provider enum must have a database type name.")

    preparer = engine.dialect.identifier_preparer
    type_name = preparer.quote(provider_enum.name)
    if provider_enum.schema:
        type_name = f"{preparer.quote_schema(provider_enum.schema)}.{type_name}"
    enum_value = LLMProviderName.GEMINI.value.replace("'", "''")
    statement = f"ALTER TYPE {type_name} ADD VALUE IF NOT EXISTS '{enum_value}'"
    with engine.begin() as conn:
        conn.exec_driver_sql(statement)
    logger.info(
        "Migrated llm_credentials provider enum: ensured %s label",
        LLMProviderName.GEMINI.value,
    )


def init_db() -> None:
    """Create all tables and seed the default (demo) user."""
    Base.metadata.create_all(bind=engine)
    _ensure_gemini_provider_enum_value()
    _ensure_document_error_message_column()
    _ensure_plan_error_message_column()
    _ensure_plan_idempotency_columns()
    _ensure_llm_verification_columns()
    _ensure_adaptive_route_columns()
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


def _ensure_plan_error_message_column() -> None:
    """Additive backfill for plans created before failure messages existed."""
    columns = {column["name"] for column in inspect(engine).get_columns("plans")}
    if "error_message" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE plans ADD COLUMN error_message VARCHAR(1024) DEFAULT ''"))
        logger.info("Migrated plans table: added error_message column")


def _ensure_plan_idempotency_columns() -> None:
    """Add the idempotency fields and uniqueness boundary to existing plans."""
    columns = {column["name"] for column in inspect(engine).get_columns("plans")}
    additions = {
        "idempotency_key": "VARCHAR(255)",
        "idempotency_request_hash": "VARCHAR(64)",
    }
    with engine.begin() as conn:
        for name, definition in additions.items():
            if name not in columns:
                conn.execute(text(f"ALTER TABLE plans ADD COLUMN {name} {definition}"))
                logger.info("Migrated plans table: added %s column", name)

    expected_columns = {"user_id", "idempotency_key"}
    inspector = inspect(engine)
    has_unique_boundary = any(
        set(constraint.get("column_names") or []) == expected_columns
        for constraint in inspector.get_unique_constraints("plans")
    ) or any(
        index.get("unique")
        and set(index.get("column_names") or []) == expected_columns
        for index in inspector.get_indexes("plans")
    )
    if not has_unique_boundary:
        Index(
            "uq_plans_user_idempotency_key",
            Plan.user_id,
            Plan.idempotency_key,
            unique=True,
        ).create(bind=engine, checkfirst=True)
        logger.info("Migrated plans table: added idempotency unique index")


def _add_missing_columns(table: str, definitions: dict[str, str]) -> None:
    """Add each column that an older database lacks (portable DDL, no-op once present)."""
    if table not in inspect(engine).get_table_names():
        return
    columns = {column["name"] for column in inspect(engine).get_columns(table)}
    with engine.begin() as conn:
        for name, definition in definitions.items():
            if name not in columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))
                logger.info("Migrated %s table: added %s column", table, name)


def _ensure_adaptive_route_columns() -> None:
    """Additive backfill for the adaptive route (session kind/date, topic mastery)."""
    _add_missing_columns(
        "sessions",
        {
            "kind": "VARCHAR(16) NOT NULL DEFAULT 'NEW'",
            "topic_id": "INTEGER",
            "scheduled_date": "DATE",
            "review_points": "JSON",
            "reinforcement_status": "VARCHAR(16) NOT NULL DEFAULT 'NONE'",
            "reinforcement_error": "VARCHAR(1024) NOT NULL DEFAULT ''",
        },
    )
    _add_missing_columns("plan_topics", {"mastery": "FLOAT", "review_box": "INTEGER NOT NULL DEFAULT 0"})
    _add_missing_columns("quiz_questions", {"source_question_id": "INTEGER"})
    if "sessions" in inspect(engine).get_table_names():
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sessions_topic_id ON sessions (topic_id)"))


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
        conn.execute(text("UPDATE llm_credentials SET config_revision = 1 WHERE config_revision IS NULL OR config_revision < 1"))
        rows = conn.execute(
            text("SELECT id, provider, model, base_url, config_revision, verified_revision, verified_at, verified_fingerprint, is_active FROM llm_credentials")
        ).mappings()
        invalid_ids = []
        for row in rows:
            try:
                credential = LLMCredential(
                    provider=LLMProviderName(row["provider"]),
                    model=row["model"] or "",
                    base_url=row["base_url"] or "",
                    config_revision=row["config_revision"],
                )
                valid = bool(
                    credential.model
                    and row["verified_at"] is not None
                    and row["verified_revision"] == credential.config_revision
                    and row["verified_fingerprint"] == verification_fingerprint(credential)
                )
            except (KeyError, ValueError):
                valid = False
            if not valid:
                invalid_ids.append(row["id"])
        if invalid_ids:
            for credential_id in invalid_ids:
                conn.execute(
                    text(
                        "UPDATE llm_credentials "
                        "SET is_active = 0, verified_revision = NULL, verified_at = NULL, "
                        "verified_fingerprint = NULL WHERE id = :credential_id"
                    ),
                    {"credential_id": credential_id},
                )
        conn.execute(
            text(
                "UPDATE llm_credentials SET is_active = 0 WHERE is_active = 1 AND id NOT IN "
                "(SELECT MAX(id) FROM llm_credentials WHERE is_active = 1 GROUP BY user_id)"
            )
        )
        if engine.dialect.name == "sqlite":
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_llm_credential_active_user ON llm_credentials (user_id) WHERE is_active = 1"))


def _seed_default_user() -> None:
    db = SessionLocal()
    try:
        if db.get(User, DEFAULT_USER_ID) is None:
            db.add(User(id=DEFAULT_USER_ID, email=DEFAULT_USER_EMAIL))
            db.commit()
            logger.info("Seeded default user id=%s", DEFAULT_USER_ID)
    finally:
        db.close()
