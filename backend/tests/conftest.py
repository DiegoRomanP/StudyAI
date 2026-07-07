"""Pytest configuration.

Redirects the database, vector store and uploads to a throwaway temp directory
*before* the app/config is imported, so tests never touch real data. Also forces
the mock LLM (no API key) for fast, deterministic runs.
"""

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="studyai_test_")

os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP}/test.db")
os.environ.setdefault("CHROMA_PERSIST_DIR", f"{_TMP}/chroma")
os.environ.setdefault("UPLOAD_DIR", f"{_TMP}/uploads")
os.environ.setdefault("ANTHROPIC_API_KEY", "")
