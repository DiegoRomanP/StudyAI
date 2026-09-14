"""Regression coverage for the additive LLM verification migration."""

from __future__ import annotations

from sqlalchemy import create_engine, inspect, text


def test_legacy_active_credentials_are_migrated_as_unverified_and_inactive(monkeypatch, tmp_path):
    from app.db import init_db

    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE llm_credentials ("
                "id INTEGER PRIMARY KEY, user_id INTEGER, provider VARCHAR(32), "
                "encrypted_api_key TEXT, key_preview VARCHAR(32), model VARCHAR(128), "
                "base_url VARCHAR(512), is_active BOOLEAN)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO llm_credentials "
                "(id, user_id, provider, encrypted_api_key, key_preview, model, base_url, is_active) "
                "VALUES (1, 1, 'OPENAI', 'ciphertext', 'sk-...test', 'gpt-4o-mini', '', 1)"
            )
        )

    monkeypatch.setattr(init_db, "engine", engine)
    init_db._ensure_llm_verification_columns()
    init_db._ensure_llm_verification_columns()

    columns = {column["name"] for column in inspect(engine).get_columns("llm_credentials")}
    assert {"config_revision", "verified_revision", "verified_at", "verified_fingerprint"} <= columns
    with engine.connect() as connection:
        row = connection.execute(
            text("SELECT config_revision, verified_revision, is_active FROM llm_credentials WHERE id = 1")
        ).one()
    assert row == (1, None, 0)


def test_legacy_plans_get_the_error_message_column(monkeypatch, tmp_path):
    from app.db import init_db

    engine = create_engine(f"sqlite:///{tmp_path / 'legacy_plans.db'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE plans (id INTEGER PRIMARY KEY, title VARCHAR(255))"))

    monkeypatch.setattr(init_db, "engine", engine)
    init_db._ensure_plan_error_message_column()
    init_db._ensure_plan_error_message_column()

    columns = {column["name"] for column in inspect(engine).get_columns("plans")}
    assert "error_message" in columns
