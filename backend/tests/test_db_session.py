"""SQLite runs in WAL with a long busy timeout, and foreign keys stay off."""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db.session import engine


@pytest.mark.skipif(engine.dialect.name != "sqlite", reason="SQLite-only pragmas")
def test_sqlite_uses_wal_a_30s_busy_timeout_and_no_foreign_keys():
    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA journal_mode")).scalar() == "wal"
        assert connection.execute(text("PRAGMA busy_timeout")).scalar() == 30000
        assert connection.execute(text("PRAGMA foreign_keys")).scalar() == 0
