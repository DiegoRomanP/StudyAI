"""Versioned pedagogy contracts, persistence and legacy-schema compatibility."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import main


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


def test_auto_fallback_and_explicit_hint():
    from app.pedagogy.registry import resolve_profile

    assert resolve_profile("history", "mathematics").id == "history"
    assert resolve_profile("auto", "mixed").id == "general"
    assert resolve_profile("auto", None).id == "general"
    assert resolve_profile("auto", "unknown-subject").id == "general"


def test_profile_snapshot_captures_version_rules_and_objectives():
    from app.pedagogy.contracts import LearningObjective
    from app.pedagogy.registry import resolve_profile, snapshot_profile

    objective = LearningObjective(
        id="objective-1",
        skill="causal reasoning",
        description="Explain a cause-and-effect relationship.",
    )
    snapshot = snapshot_profile(resolve_profile("history", None), [objective])

    assert snapshot.profile_id == "history"
    assert snapshot.profile_version == 1
    assert snapshot.rules
    assert snapshot.objectives == [objective]


def test_v1_request_defaults(client: TestClient):
    from app.schemas.plan import PlanGenerateRequest

    legacy = PlanGenerateRequest.model_validate({"goal_id": 1})
    assert legacy.content_version == 1
    assert legacy.subject_hint is None

    adaptive = PlanGenerateRequest.model_validate(
        {"goal_id": 1, "content_version": 2, "subject_hint": "history"}
    )
    assert adaptive.content_version == 2
    assert adaptive.subject_hint == "history"

    with pytest.raises(ValidationError):
        PlanGenerateRequest.model_validate(
            {"goal_id": 1, "content_version": 1, "subject_hint": "history"}
        )

    response = client.post(
        "/plans/generate", json={"goal_id": 1, "subject_hint": "history"}
    )
    assert response.status_code == 422


def test_v2_omitted_subject_hint_resolves_to_auto():
    from app.schemas.plan import PlanGenerateRequest

    request = PlanGenerateRequest.model_validate(
        {"goal_id": 1, "content_version": 2}
    )

    assert request.subject_hint == "auto"


def test_assessment_submission_uses_discriminated_answer_types():
    from app.schemas.adaptive_learning import AssessmentSubmissionV2

    submission = AssessmentSubmissionV2.model_validate(
        {
            "revision": "revision-1",
            "answers": [
                {"kind": "flashcard", "question_id": "legacy:1", "quality": 4},
                {
                    "kind": "multiple_choice",
                    "question_id": "legacy:2",
                    "selected_option": "B",
                },
                {"kind": "numeric", "question_id": "adaptive:n", "value": "3/4"},
                {
                    "kind": "sequence",
                    "question_id": "adaptive:s",
                    "ordered_ids": ["first", "second"],
                },
                {
                    "kind": "rubric",
                    "question_id": "adaptive:r",
                    "text": "The evidence supports the claim.",
                    "criterion_ratings": {"evidence": 2},
                },
            ],
        }
    )
    assert [answer.kind for answer in submission.answers] == [
        "flashcard",
        "multiple_choice",
        "numeric",
        "sequence",
        "rubric",
    ]
    assert submission.answers[2].value == "3/4"

    with pytest.raises(ValidationError):
        AssessmentSubmissionV2.model_validate(
            {
                "revision": "revision-1",
                "answers": [{"kind": "essay", "question_id": "adaptive:x"}],
            }
        )


def test_response_dtos_are_typed_and_do_not_accept_private_solution_fields():
    from app.pedagogy.contracts import LearningObjective, LessonBlock
    from app.pedagogy.registry import resolve_profile, snapshot_profile
    from app.schemas.adaptive_learning import (
        AssessmentResponseV2,
        AssessmentResultItemV2,
        AssessmentResultV2,
        LearningModeResponse,
        LearningResponseV2,
    )

    snapshot = snapshot_profile(
        resolve_profile("general", None),
        [LearningObjective(id="objective-1", skill="recall", description="Recall a key idea.")],
    )
    learning = LearningResponseV2(
        session_id=3,
        snapshot=snapshot,
        lesson_blocks=[
            LessonBlock(
                id="block-1",
                kind="explanation",
                objective_ids=["objective-1"],
                content_markdown="A short explanation.",
            )
        ],
        content_markdown="Fallback lesson text.",
    )
    assert LearningModeResponse(content_version=2).content_version == 2
    assert learning.lesson_blocks[0].content_markdown == "A short explanation."

    assessment = AssessmentResponseV2.model_validate(
        {
            "quiz_id": 8,
            "revision": "revision-1",
            "questions": [
                {
                    "question_id": "adaptive:n",
                    "kind": "numeric",
                    "prompt": "What is one half as a decimal?",
                    "objective_ids": ["objective-1"],
                }
            ],
        }
    )
    assert assessment.questions[0].question_id == "adaptive:n"
    result = AssessmentResultV2(
        quiz_id=8,
        revision="revision-1",
        score=100,
        correct=1,
        total=1,
        detail=[
            AssessmentResultItemV2(
                question_id="adaptive:n",
                kind="numeric",
                correct=True,
                submitted_answer="0.5",
                expected_answer="0.5",
            )
        ],
    )
    assert result.detail[0].correct is True
    with pytest.raises(ValidationError):
        AssessmentResponseV2.model_validate(
            {
                "quiz_id": 8,
                "revision": "revision-1",
                "questions": [
                    {
                        "question_id": "adaptive:n",
                        "kind": "numeric",
                        "prompt": "Question",
                        "objective_ids": ["objective-1"],
                        "expected_answer": "0.5",
                    }
                ],
            }
        )


@pytest.mark.parametrize(
    "question",
    [
        {
            "question_id": "legacy:2",
            "kind": "multiple_choice",
            "prompt": "Choose the correct answer.",
            "objective_ids": ["objective-1"],
            "options": ["A", "B"],
            "answer": "B",
        },
        {
            "question_id": "adaptive:s",
            "kind": "sequence",
            "prompt": "Put these steps in order.",
            "objective_ids": ["objective-1"],
            "sequence_items": [
                {"id": "first", "text": "First"},
                {"id": "second", "text": "Second"},
            ],
            "expected_answer": ["first", "second"],
        },
        {
            "question_id": "adaptive:r",
            "kind": "rubric",
            "prompt": "Explain the evidence.",
            "objective_ids": ["objective-1"],
            "rubric_criteria": [
                {
                    "criterion_id": "evidence",
                    "description": "Use evidence.",
                    "descriptors": ["Not yet", "Partly", "Clearly"],
                }
            ],
            "exemplar": "Private example answer.",
        },
    ],
)
def test_assessment_response_rejects_private_answers_for_all_question_types(question):
    from app.schemas.adaptive_learning import AssessmentResponseV2

    with pytest.raises(ValidationError):
        AssessmentResponseV2.model_validate(
            {"quiz_id": 8, "revision": "revision-1", "questions": [question]}
        )


def test_adaptive_content_repository_round_trips_validated_payload():
    from app.db.base import Base
    from app.models.goal import Goal
    from app.models.plan import Plan
    from app.models.quiz import Quiz
    from app.models.session import Session as StudySession, SessionMaterial
    from app.models.user import User
    from app.pedagogy.contracts import (
        AdaptiveAssessmentPayload,
        AdaptiveSessionDraft,
        LearningObjective,
        LessonBlock,
        StoredAssessmentQuestion,
    )
    from app.pedagogy.registry import resolve_profile, snapshot_profile
    from app.repositories.adaptive_content_repository import AdaptiveContentRepository

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as db:
            user = User(email="adaptive-contracts@example.test")
            db.add(user)
            db.flush()
            goal = Goal(user_id=user.id, title="History", description="")
            db.add(goal)
            db.flush()
            plan = Plan(user_id=user.id, goal_id=goal.id)
            db.add(plan)
            db.flush()
            study_session = StudySession(plan_id=plan.id, topic_name="Causality")
            db.add(study_session)
            db.flush()
            db.add(
                SessionMaterial(
                    session_id=study_session.id,
                    content_markdown="Fallback lesson.",
                    youtube_keywords=[],
                )
            )
            db.add(Quiz(session_id=study_session.id))
            db.flush()

            objective = LearningObjective(
                id="objective-1",
                skill="causal reasoning",
                description="Explain a cause-and-effect relationship.",
            )
            draft = AdaptiveSessionDraft(
                pedagogy_snapshot=snapshot_profile(resolve_profile("history", None), [objective]),
                lesson_blocks=[
                    LessonBlock(
                        id="block-1",
                        kind="context",
                        objective_ids=[objective.id],
                        content_markdown="Historical context.",
                        source_refs=["source-1"],
                    )
                ],
                adaptive_assessment=AdaptiveAssessmentPayload(
                    schema_version=2,
                    question_objectives={"legacy:1": [objective.id]},
                    questions=[
                        StoredAssessmentQuestion(
                            question_id="adaptive:n",
                            kind="numeric",
                            prompt="Express one half as a decimal.",
                            objective_ids=[objective.id],
                            expected_answer="0.5",
                        )
                    ],
                ),
                assessment_revision="revision-1",
                assessment_state="open",
            )
            repository = AdaptiveContentRepository(db)
            repository.save(study_session.id, draft)
            db.flush()

            stored = repository.get(study_session.id)
            assert stored == draft
            assert repository.get(study_session.id + 100) is None
    finally:
        engine.dispose()


def test_additive_backfill_preserves_legacy_data(monkeypatch):
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
                    "CREATE TABLE session_materials (id INTEGER PRIMARY KEY, "
                    "session_id INTEGER, content_markdown TEXT, youtube_keywords JSON)"
                )
            )
            connection.execute(
                text("CREATE TABLE quizzes (id INTEGER PRIMARY KEY, session_id INTEGER)")
            )
            connection.execute(
                text("INSERT INTO plans VALUES (1, 'Legacy plan', '[3, 5]')")
            )
            connection.execute(
                text(
                    "INSERT INTO session_materials VALUES "
                    "(2, 4, 'Legacy lesson', '[\"history\"]')"
                )
            )
            connection.execute(text("INSERT INTO quizzes VALUES (6, 4)"))

        monkeypatch.setattr(init_db_module, "engine", engine)
        init_db_module._ensure_adaptive_content_columns()
        init_db_module._ensure_adaptive_content_columns()

        with engine.connect() as connection:
            plan = connection.execute(
                text(
                    "SELECT title, document_ids, content_version, subject_hint "
                    "FROM plans WHERE id = 1"
                )
            ).one()
            material = connection.execute(
                text(
                    "SELECT content_markdown, youtube_keywords, pedagogy_snapshot, lesson_blocks "
                    "FROM session_materials WHERE id = 2"
                )
            ).one()
            quiz = connection.execute(
                text(
                    "SELECT adaptive_assessment, assessment_revision, assessment_state "
                    "FROM quizzes WHERE id = 6"
                )
            ).one()

        assert tuple(plan) == ("Legacy plan", "[3, 5]", 1, None)
        assert tuple(material) == ("Legacy lesson", '["history"]', None, None)
        assert tuple(quiz) == (None, None, None)
        assert {column["name"] for column in inspect(engine).get_columns("plans")} >= {
            "content_version",
            "subject_hint",
        }
    finally:
        engine.dispose()


def test_public_v1_responses_are_unchanged_after_adaptive_backfill(tmp_path, monkeypatch):
    import io

    import main
    import app.db.init_db as db_init
    import app.db.session as db_session
    import app.services.document_service as document_service
    import app.services.plan_service as plan_service
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(
        f"sqlite:///{tmp_path / 'legacy-v1.db'}",
        connect_args={"check_same_thread": False, "timeout": 30},
    )
    session_factory = sessionmaker(
        bind=engine, autocommit=False, autoflush=False, expire_on_commit=False
    )
    monkeypatch.setattr(db_session, "engine", engine)
    monkeypatch.setattr(db_session, "SessionLocal", session_factory)
    monkeypatch.setattr(db_init, "engine", engine)
    monkeypatch.setattr(db_init, "SessionLocal", session_factory)
    monkeypatch.setattr(main, "SessionLocal", session_factory)
    monkeypatch.setattr(document_service, "SessionLocal", session_factory)
    monkeypatch.setattr(plan_service, "SessionLocal", session_factory)

    try:
        with TestClient(main.app) as client:
            goal_id = client.post(
                "/goals", json={"goal_type": "LEARNING", "title": "Legacy", "description": ""}
            ).json()["id"]
            markdown = "# Tema\n\n" + "Contenido de prueba para el plan. " * 200
            upload = client.post(
                "/documents/upload",
                files={"file": ("legacy.md", io.BytesIO(markdown.encode()), "text/markdown")},
            )
            document_id = upload.json()["id"]
            assert client.get(f"/documents/{document_id}").json()["status"] == "INDEXED"

            generation = client.post(
                "/plans/generate", json={"goal_id": goal_id, "document_ids": [document_id]}
            )
            assert generation.status_code == 202
            plan_id = generation.json()["id"]
            plan = client.get(f"/plans/{plan_id}").json()
            assert plan["status"] == "READY"
            session_id = plan["sessions"][0]["id"]

            def public_v1_responses() -> dict[str, dict]:
                responses = {
                    "plan": client.get(f"/plans/{plan_id}"),
                    "session": client.get(f"/sessions/{session_id}"),
                    "quiz": client.get(f"/quizzes/{session_id}"),
                }
                assert all(response.status_code == 200 for response in responses.values())
                return {name: response.json() for name, response in responses.items()}

            before = public_v1_responses()
            assert "pedagogy_snapshot" not in before["session"]["material"]
            assert "lesson_blocks" not in before["session"]["material"]

            legacy_columns = {
                "plans": ("content_version", "subject_hint"),
                "session_materials": ("pedagogy_snapshot", "lesson_blocks"),
                "quizzes": ("adaptive_assessment", "assessment_revision", "assessment_state"),
            }
            with engine.begin() as connection:
                for table, columns in legacy_columns.items():
                    for column in columns:
                        connection.exec_driver_sql(f"ALTER TABLE {table} DROP COLUMN {column}")

            with engine.connect() as connection:
                for table, columns in legacy_columns.items():
                    existing = {
                        row[1] for row in connection.exec_driver_sql(f"PRAGMA table_info({table})")
                    }
                    assert not (existing & set(columns)), f"{table} still has adaptive columns"

            db_init._ensure_adaptive_content_columns()

            assert public_v1_responses() == before
    finally:
        engine.dispose()


def test_repository_revalidates_mutated_draft_before_persisting():
    from unittest.mock import MagicMock

    from app.pedagogy.contracts import (
        AdaptiveAssessmentPayload,
        AdaptiveSessionDraft,
        PedagogySnapshot,
    )
    from app.repositories.adaptive_content_repository import AdaptiveContentRepository

    draft = AdaptiveSessionDraft(
        pedagogy_snapshot=PedagogySnapshot(
            profile_id="general", profile_version=1, rules=[], objectives=[]
        ),
        lesson_blocks=[],
        adaptive_assessment=AdaptiveAssessmentPayload(
            schema_version=2, question_objectives={}, questions=[]
        ),
    )
    invalid = draft.model_copy(
        update={
            "pedagogy_snapshot": draft.pedagogy_snapshot.model_copy(
                update={"profile_id": "science"}
            )
        }
    )
    db = MagicMock()

    with pytest.raises(ValidationError):
        AdaptiveContentRepository(db).save(1, invalid)

    db.get.assert_not_called()
    db.execute.assert_not_called()
    db.flush.assert_not_called()
