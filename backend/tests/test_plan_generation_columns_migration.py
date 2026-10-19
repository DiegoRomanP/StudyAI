"""Additive backfill of the plan generation progress and free-AI day columns."""

from __future__ import annotations

from sqlalchemy import create_engine, inspect, text


def test_an_old_plans_table_gets_the_generation_columns(monkeypatch, tmp_path):
    from app.db import init_db

    engine = create_engine(f"sqlite:///{tmp_path / 'legacy_plans.db'}")
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE plans (id INTEGER PRIMARY KEY, user_id INTEGER, goal_id INTEGER, "
                "title VARCHAR(255), status VARCHAR(10), document_ids JSON, error_message VARCHAR(1024))"
            )
        )
        connection.execute(
            text("INSERT INTO plans (id, user_id, goal_id, title, status) VALUES (1, 1, 1, 'Viejo', 'FAILED')")
        )

    monkeypatch.setattr(init_db, "engine", engine)
    init_db._ensure_plan_generation_columns()
    init_db._ensure_plan_generation_columns()

    columns = {column["name"] for column in inspect(engine).get_columns("plans")}
    assert {"progress_stage", "progress_done", "progress_total", "free_ai_use_date"} <= columns
    with engine.connect() as connection:
        row = connection.execute(
            text("SELECT progress_stage, progress_done, progress_total, free_ai_use_date FROM plans WHERE id = 1")
        ).one()
    assert row == (None, 0, 0, None)
