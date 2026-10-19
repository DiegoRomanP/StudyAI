"""The adaptive-route columns are added to databases created before them."""

from __future__ import annotations

from sqlalchemy import create_engine, inspect, text


def _legacy_engine(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE sessions (id INTEGER PRIMARY KEY, plan_id INTEGER, order_index INTEGER, "
                "topic_name VARCHAR(255), duration_minutes INTEGER, review_offset_days INTEGER, "
                "status VARCHAR(16), completed_at DATETIME)"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE plan_topics (id INTEGER PRIMARY KEY, plan_id INTEGER, name VARCHAR(255), "
                "subtopics JSON, difficulty INTEGER, relevance FLOAT, selected BOOLEAN)"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE quiz_questions (id INTEGER PRIMARY KEY, quiz_id INTEGER, order_index INTEGER, "
                "question_type VARCHAR(16), prompt TEXT, answer TEXT, options JSON)"
            )
        )
        connection.execute(
            text("INSERT INTO sessions (id, plan_id, topic_name, status) VALUES (1, 1, 'Tema', 'PENDING')")
        )
        connection.execute(text("INSERT INTO plan_topics (id, plan_id, name) VALUES (1, 1, 'Tema')"))
        connection.execute(
            text("INSERT INTO quiz_questions (id, quiz_id, prompt) VALUES (1, 1, '¿Qué?')")
        )
    return engine


def test_legacy_tables_gain_adaptive_columns_idempotently(monkeypatch, tmp_path):
    from app.db import init_db

    engine = _legacy_engine(tmp_path)
    monkeypatch.setattr(init_db, "engine", engine)
    init_db._ensure_adaptive_route_columns()
    init_db._ensure_adaptive_route_columns()

    inspector = inspect(engine)
    session_columns = {c["name"] for c in inspector.get_columns("sessions")}
    assert {
        "kind", "topic_id", "scheduled_date", "review_points",
        "reinforcement_status", "reinforcement_error",
    } <= session_columns
    assert {"mastery", "review_box"} <= {c["name"] for c in inspector.get_columns("plan_topics")}
    assert "source_question_id" in {c["name"] for c in inspector.get_columns("quiz_questions")}
    assert any(index["name"] == "ix_sessions_topic_id" for index in inspector.get_indexes("sessions"))


def test_legacy_session_row_reads_with_defaults(monkeypatch, tmp_path):
    from app.db import init_db

    engine = _legacy_engine(tmp_path)
    monkeypatch.setattr(init_db, "engine", engine)
    init_db._ensure_adaptive_route_columns()

    with engine.connect() as connection:
        session_row = connection.execute(
            text(
                "SELECT kind, scheduled_date, reinforcement_status, reinforcement_error "
                "FROM sessions WHERE id = 1"
            )
        ).one()
        topic_row = connection.execute(text("SELECT mastery, review_box FROM plan_topics WHERE id = 1")).one()
    assert session_row == ("NEW", None, "NONE", "")
    assert topic_row == (None, 0)
