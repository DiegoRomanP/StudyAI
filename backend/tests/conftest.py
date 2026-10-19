"""Pytest configuration.

Redirects the database, vector store and uploads to a throwaway temp directory
*before* the app/config is imported, so tests never touch real data. Also forces
the mock LLM (no API key) for fast, deterministic runs.
"""

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="studyai_test_")

os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["CHROMA_PERSIST_DIR"] = f"{_TMP}/chroma"
os.environ["UPLOAD_DIR"] = f"{_TMP}/uploads"
os.environ["ANTHROPIC_API_KEY"] = ""
# The operator's free-tier key must never reach a test run (no network, no quota).
# An environment variable beats both .env files, including the repo-root one.
os.environ["DEEPSEEK_API_KEY"] = ""
