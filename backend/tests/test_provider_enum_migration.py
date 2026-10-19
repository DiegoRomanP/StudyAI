"""PostgreSQL-only enum migration safety for newly registered providers."""

from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

init_db_module = importlib.import_module("app.db.init_db")


class _RecordingTransaction:
    def __init__(self, events: list[str]):
        self.events = events

    def __enter__(self):
        self.events.append("begin")
        return self

    def exec_driver_sql(self, statement: str):
        self.events.append(statement)

    def __exit__(self, exception_type, _exception, _traceback):
        self.events.append("rollback" if exception_type else "commit")
        return False


class _RecordingEngine:
    def __init__(self, events: list[str], dialect):
        self.events = events
        self.dialect = dialect

    def begin(self):
        return _RecordingTransaction(self.events)


def _migration_helper():
    helper = getattr(init_db_module, "_ensure_provider_enum_values", None)
    assert callable(helper), "database bootstrap must add later provider enum labels"
    return helper


def test_postgres_enum_backfill_runs_after_create_all_and_commits(monkeypatch):
    events: list[str] = []
    monkeypatch.setattr(
        init_db_module,
        "engine",
        _RecordingEngine(events, postgresql.dialect()),
    )
    monkeypatch.setattr(
        init_db_module.Base.metadata,
        "create_all",
        lambda bind: events.append("create_all"),
    )
    for name in (
        "_ensure_document_error_message_column",
        "_ensure_plan_error_message_column",
        "_ensure_plan_idempotency_columns",
        "_ensure_plan_generation_columns",
        "_purge_retired_provider_credentials",
        "_ensure_llm_verification_columns",
        "_ensure_adaptive_route_columns",
        "_seed_default_user",
    ):
        monkeypatch.setattr(init_db_module, name, lambda: None)

    init_db_module.init_db()

    assert events == [
        "create_all",
        "begin",
        "ALTER TYPE llmprovidername ADD VALUE IF NOT EXISTS 'GEMINI'",
        "ALTER TYPE llmprovidername ADD VALUE IF NOT EXISTS 'DEEPSEEK'",
        "commit",
    ]


def test_retired_provider_credentials_are_purged_before_the_orm_reads_them(monkeypatch, tmp_path):
    from app.db.base import Base
    from app.models.llm_credential import LLMCredential

    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        for provider in ("GLM", "HUGGINGFACE", "OPENAI"):
            connection.execute(
                text(
                    "INSERT INTO llm_credentials (user_id, provider, encrypted_api_key, key_preview, "
                    "model, base_url, is_active, config_revision, created_at) "
                    "VALUES (1, :provider, 'x', '', '', '', 0, 1, CURRENT_TIMESTAMP)"
                ),
                {"provider": provider},
            )
    monkeypatch.setattr(init_db_module, "engine", engine)

    init_db_module._purge_retired_provider_credentials()

    with Session(engine) as session:
        providers = [credential.provider.value for credential in session.scalars(select(LLMCredential))]
    assert providers == ["OPENAI"]


def test_sqlite_enum_backfill_is_a_noop(monkeypatch):
    def unexpected_transaction():
        pytest.fail("SQLite must not run PostgreSQL enum DDL")

    monkeypatch.setattr(
        init_db_module,
        "engine",
        SimpleNamespace(dialect=sqlite.dialect(), begin=unexpected_transaction),
    )

    _migration_helper()()
