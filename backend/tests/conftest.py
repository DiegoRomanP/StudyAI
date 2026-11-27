"""Pytest configuration.

Redirects the database, vector store and uploads to a throwaway temp directory
*before* the app/config is imported, so tests never touch real data. Also forces
the mock LLM (no API key) for fast, deterministic runs.
"""

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="studyai_test_")

# TEST_DATABASE_URL runs the suite against Postgres (see docker-compose.dev.yml); it starts
# from an empty public schema so every run is as fresh as the SQLite temp file.
_TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
if _TEST_DATABASE_URL:
    from sqlalchemy import create_engine, text

    _reset_engine = create_engine(_TEST_DATABASE_URL)
    with _reset_engine.begin() as _conn:
        _conn.execute(text("DROP SCHEMA public CASCADE"))
        _conn.execute(text("CREATE SCHEMA public"))
    _reset_engine.dispose()
os.environ["DATABASE_URL"] = _TEST_DATABASE_URL or f"sqlite:///{_TMP}/test.db"
os.environ["CHROMA_PERSIST_DIR"] = f"{_TMP}/chroma"
os.environ["UPLOAD_DIR"] = f"{_TMP}/uploads"
os.environ["ANTHROPIC_API_KEY"] = ""
# The operator's free-tier key must never reach a test run (no network, no quota).
# An environment variable beats both .env files, including the repo-root one.
os.environ["DEEPSEEK_API_KEY"] = ""
os.environ["CLAUDE_API_KEY"] = ""
# Deployment/SaaS settings: tests always run self-hosted, demo auth, local files, fake payments.
for _k in (
    "SUPABASE_URL", "SUPABASE_JWKS_URL", "SUPABASE_PUBLISHABLE_KEY", "S3_ENDPOINT_URL", "S3_BUCKET",
    "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET",
):
    os.environ[_k] = ""
os.environ.update(
    DEPLOYMENT_MODE="self_hosted", AUTH_MODE="demo", STORAGE_BACKEND="local", PAYMENT_GATEWAY="fake",
    APP_ENV="development", S3_REGION="auto", RATE_LIMIT_ENABLED="false",
)

import pytest  # noqa: E402 - after the environment redirection above


@pytest.fixture(autouse=True)
def _no_real_agent_cli(monkeypatch):
    """Agent CLIs (Claude Code, OpenCode, Pi, Codex) spend the operator's subscription."""
    from app.llm.harness import provider

    def refuse(*args, **kwargs):
        raise AssertionError("A test tried to launch a real agent CLI; pass a fake runner.")

    monkeypatch.setattr(provider, "run_cli", refuse)
