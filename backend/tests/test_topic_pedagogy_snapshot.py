from __future__ import annotations

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session


def test_additive_backfill_adds_topic_snapshot_and_intention_without_rewriting_rows(monkeypatch):
    import app.db.init_db as init_db_module

    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE plans (id INTEGER PRIMARY KEY, title VARCHAR(255), "
                    "document_ids JSON)"
                )
            )
            connection.execute(
                text(
                    "CREATE TABLE plan_topics (id INTEGER PRIMARY KEY, plan_id INTEGER, "
                    "name VARCHAR(255), subtopics JSON)"
                )
            )
            connection.execute(
                text("INSERT INTO plans VALUES (1, 'Legacy plan', '[3, 5]')")
            )
            connection.execute(
                text("INSERT INTO plan_topics VALUES (2, 1, 'Legacy topic', '[\"a\"]')")
            )

        monkeypatch.setattr(init_db_module, "engine", engine)
        init_db_module._ensure_adaptive_content_columns()
        init_db_module._ensure_adaptive_content_columns()

        with engine.connect() as connection:
            plan = connection.execute(
                text(
                    "SELECT title, document_ids, generation_goal_type "
                    "FROM plans WHERE id = 1"
                )
            ).one()
            topic = connection.execute(
                text(
                    "SELECT name, subtopics, pedagogy_snapshot "
                    "FROM plan_topics WHERE id = 2"
                )
            ).one()

        assert tuple(plan) == ("Legacy plan", "[3, 5]", None)
        assert tuple(topic) == ("Legacy topic", '["a"]', None)

        plan_columns = {
            column["name"]: column for column in inspect(engine).get_columns("plans")
        }
        topic_columns = {
            column["name"]: column for column in inspect(engine).get_columns("plan_topics")
        }
        assert plan_columns["generation_goal_type"]["type"].length == 16
        assert plan_columns["generation_goal_type"]["nullable"] is True
        assert topic_columns["pedagogy_snapshot"]["type"].__class__.__name__ == "JSON"
        assert topic_columns["pedagogy_snapshot"]["nullable"] is True
    finally:
        engine.dispose()


def test_topic_snapshot_round_trips_without_exposing_it_through_plan_responses():
    from app.models.goal import Goal
    from app.models.plan import Plan, PlanStatus, PlanTopic
    from app.models.user import User
    from app.pedagogy.registry import resolve_profile, snapshot_profile
    from app.schemas.plan import PlanResponse, PlanTopicResponse

    engine = create_engine("sqlite://")
    try:
        from app.db.base import Base

        Base.metadata.create_all(engine)
        snapshot = snapshot_profile(resolve_profile("logical_deductive", None), [])
        expected_snapshot = snapshot.model_dump(mode="json")

        with Session(engine) as db:
            user = User(email="topic-snapshot@example.test", hashed_password="test")
            db.add(user)
            db.flush()
            goal = Goal(user_id=user.id, title="Math exam", description="")
            db.add(goal)
            db.flush()
            plan = Plan(
                user_id=user.id,
                goal_id=goal.id,
                title="Math plan",
                status=PlanStatus.READY,
                document_ids=[],
            )
            db.add(plan)
            db.flush()
            topic = PlanTopic(
                plan_id=plan.id,
                name="Algebra",
                subtopics=["Equations"],
                pedagogy_snapshot=expected_snapshot,
            )
            db.add(topic)
            db.commit()
            plan_id = plan.id
            topic_id = topic.id

        with Session(engine) as db:
            stored_plan = db.get(Plan, plan_id)
            stored_topic = db.get(PlanTopic, topic_id)
            assert stored_topic.pedagogy_snapshot == expected_snapshot
            assert "pedagogy_snapshot" not in PlanTopicResponse.model_validate(
                stored_topic
            ).model_dump()
            assert "generation_goal_type" not in PlanResponse.model_validate(
                stored_plan
            ).model_dump()
            assert "pedagogy_snapshot" not in PlanResponse.model_validate(
                stored_plan
            ).model_dump()["topics"][0]
    finally:
        engine.dispose()
