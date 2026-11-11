"""Public plan-generation coverage for adaptive session content v2."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from app.core.exceptions import LLMError
from app.db.session import SessionLocal
from app.llm.mock_provider import MockLLMProvider
from app.models.goal import GoalType
from app.models.plan import Plan, PlanStatus
from app.models.quiz import Quiz, QuizQuestion
from app.models.session import Session as StudySession, SessionMaterial
from app.pedagogy.contracts import LearningObjective, PedagogySnapshot
from app.pedagogy.registry import resolve_profile, snapshot_profile
from app.services.adaptive_content_builder import build_adaptive_session_content
from app.strategies.goal_strategies import GoalStrategyFactory


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


class _CountingMock(MockLLMProvider):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[str] = []
        self.contexts: list[tuple[str, dict]] = []

    def complete(self, *, kind: str, context: dict | None = None, **kwargs) -> str:
        self.calls.append(kind)
        self.contexts.append((kind, context or {}))
        return super().complete(kind=kind, context=context, **kwargs)


class _InvalidSessionMock(_CountingMock):
    def complete(self, *, kind: str, context: dict | None = None, **kwargs) -> str:
        if kind == "topic_analysis":
            self.calls.append(kind)
            self.contexts.append((kind, context or {}))
            return json.dumps(
                {
                    "topics": [
                        {
                            "name": "Álgebra",
                            "subtopics": ["Fracciones equivalentes"],
                            "difficulty": 2,
                            "relevance": 0.9,
                            "topic_profile": "logical_deductive",
                            "objectives": [
                                {
                                    "id": "algebra-basics",
                                    "skill": "Interpretar fracciones",
                                    "description": "Explicar una fracción equivalente.",
                                    "bloom_target": "understand",
                                }
                            ],
                        }
                    ]
                }
            )
        if kind == "session_content":
            self.calls.append(kind)
            self.contexts.append((kind, context or {}))
            return json.dumps({"lesson_blocks": [], "questions": []})
        return super().complete(kind=kind, context=context, **kwargs)


class _FailSecondContentOnce(_CountingMock):
    def __init__(self) -> None:
        super().__init__()
        self.content_calls = 0
        self.fail_enabled = True

    def complete(self, *, kind: str, context: dict | None = None, **kwargs) -> str:
        if kind == "session_content":
            self.content_calls += 1
            if self.fail_enabled and self.content_calls == 2:
                self.calls.append(kind)
                self.contexts.append((kind, context or {}))
                raise LLMError("Falla transitoria en la segunda sesión.", code="LLM_PROVIDER_ERROR")
        return super().complete(kind=kind, context=context, **kwargs)


def _goal(client: TestClient, goal_type: str) -> int:
    response = client.post(
        "/goals",
        json={"goal_type": goal_type, "title": f"Adaptive {goal_type}", "description": ""},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _generate(
    client: TestClient, goal_id: int, *, document_ids: list[int] | None = None
) -> tuple[int, dict]:
    response = client.post(
        "/plans/generate",
        json={
            "goal_id": goal_id,
            "document_ids": document_ids or [],
            "content_version": 2,
            "profile_hint": "logical_deductive",
        },
    )
    assert response.status_code == 202, response.text
    plan_id = response.json()["id"]
    plan_response = client.get(f"/plans/{plan_id}")
    assert plan_response.status_code == 200, plan_response.text
    return plan_id, plan_response.json()


@pytest.mark.parametrize(
    "goal_type,expected_flashcards,expected_assessment",
    [("LEARNING", 5, 5), ("EXAM", 3, 7), ("MEMORIZATION", 8, 2)],
)
def test_v2_plan_publishes_adaptive_sessions_with_one_call_per_session_and_strategy_counts(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    goal_type: str,
    expected_flashcards: int,
    expected_assessment: int,
):
    provider = _CountingMock()
    monkeypatch.setattr("app.services.plan_service.get_llm_provider", lambda *_args: provider)

    def retrieval_must_not_run(*_args, **_kwargs):
        raise AssertionError("v2 plans without document IDs must not retrieve user documents")

    monkeypatch.setattr(
        "app.services.plan_service.Retriever.retrieve_texts", retrieval_must_not_run
    )
    goal_id = _goal(client, goal_type)

    plan_id, plan = _generate(client, goal_id)

    assert plan["status"] == PlanStatus.READY.value
    sessions = plan["sessions"]
    assert sessions
    assert len(provider.calls) == 2 + len(sessions)
    assert provider.calls.count("topic_analysis") == 1
    assert provider.calls.count("session_plan") == 1
    assert provider.calls.count("session_content") == len(sessions)
    assert all(
        context.get("content_version") == 2
        for kind, context in provider.contexts
        if kind == "session_content"
    )
    assert all(
        isinstance(context.get("pedagogy_snapshot"), dict)
        and isinstance(context.get("sources"), dict)
        for kind, context in provider.contexts
        if kind == "session_content"
    )

    for session in sessions:
        session_id = session["id"]
        lesson = client.get(f"/sessions/{session_id}/learning-v2")
        assessment = client.get(f"/quizzes/{session_id}/assessment-v2")
        assert lesson.status_code == 200, lesson.text
        assert assessment.status_code == 200, assessment.text
        snapshot = PedagogySnapshot.model_validate(lesson.json()["snapshot"])
        assert snapshot.profile_id == "logical_deductive"
        assert lesson.json()["lesson_blocks"]
        questions = assessment.json()["questions"]
        flashcards = [question for question in questions if question["kind"] == "flashcard"]
        assert len(flashcards) == expected_flashcards
        assert all(question["objective_ids"] for question in flashcards)
        assert len(questions) - expected_flashcards == expected_assessment

    with SessionLocal() as db:
        stored_plan = db.get(Plan, plan_id)
        assert stored_plan is not None
        for session in stored_plan.sessions:
            assert session.material is not None
            assert session.quiz is not None
            assert session.material.pedagogy_snapshot["profile_id"] == "logical_deductive"
            assert session.material.lesson_blocks
            assert session.quiz.adaptive_assessment["schema_version"] == 2
            assert len(session.quiz.questions) == expected_flashcards
            assert all(question.question_type.value == "FLASHCARD" for question in session.quiz.questions)


def test_invalid_v2_session_payload_publishes_no_material_quiz_or_flashcards(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    provider = _InvalidSessionMock()
    monkeypatch.setattr("app.services.plan_service.get_llm_provider", lambda *_args: provider)
    goal_id = _goal(client, "LEARNING")

    plan_id, plan = _generate(client, goal_id)

    assert plan["status"] == PlanStatus.FAILED.value
    assert provider.calls.count("session_content") == 1
    assert len(plan["sessions"]) == 1
    session_id = plan["sessions"][0]["id"]
    with SessionLocal() as db:
        session = db.get(StudySession, session_id)
        assert session is not None
        assert session.material is None
        assert session.quiz is None
        assert db.scalars(
            select(QuizQuestion).join(Quiz).where(Quiz.session_id == session_id)
        ).all() == []
    assert client.get(f"/sessions/{session_id}/learning-v2").status_code == 409
    assert client.get(f"/quizzes/{session_id}/assessment-v2").status_code == 409


def test_uploaded_document_chunks_are_indexed_and_passed_to_v2_builder(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    provider = _CountingMock()
    monkeypatch.setattr("app.services.plan_service.get_llm_provider", lambda *_args: provider)
    markdown = "# Álgebra y fracciones\n\n" + (
        "Una fracción representa una relación entre partes y el total. " * 80
    )
    uploaded = client.post(
        "/documents/upload",
        files={"file": ("adaptive-source.md", markdown.encode(), "text/markdown")},
    )
    assert uploaded.status_code == 201, uploaded.text
    document_id = uploaded.json()["id"]
    assert client.get(f"/documents/{document_id}").json()["status"] == "INDEXED"
    goal_id = _goal(client, "LEARNING")

    _, plan = _generate(client, goal_id, document_ids=[document_id])

    assert plan["status"] == PlanStatus.READY.value
    session_contexts = [
        context for kind, context in provider.contexts if kind == "session_content"
    ]
    assert session_contexts
    assert all(context["sources"] for context in session_contexts)
    assert all(any("fracción" in source.casefold() for source in context["sources"].values()) for context in session_contexts)


def test_v2_resume_skips_fully_published_sessions_and_generates_only_missing_content(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    provider = _FailSecondContentOnce()
    monkeypatch.setattr("app.services.plan_service.get_llm_provider", lambda *_args: provider)
    monkeypatch.setattr(
        "app.services.plan_service.Retriever.retrieve_texts",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("v2 plans without document IDs must not retrieve user documents")
        ),
    )
    goal_id = _goal(client, "LEARNING")

    plan_id, failed_plan = _generate(client, goal_id)

    assert failed_plan["status"] == PlanStatus.FAILED.value
    assert len(failed_plan["sessions"]) > 1
    content_calls_before_resume = provider.calls.count("session_content")
    assert content_calls_before_resume == 2
    first_session_id = failed_plan["sessions"][0]["id"]
    with SessionLocal() as db:
        first_session = db.get(StudySession, first_session_id)
        assert first_session.material is not None
        assert first_session.quiz is not None
        first_material_id = first_session.material.id
        first_quiz_id = first_session.quiz.id
        first_revision = first_session.quiz.assessment_revision

    provider.fail_enabled = False
    response = client.post(f"/plans/{plan_id}/resume")

    assert response.status_code == 202
    ready = client.get(f"/plans/{plan_id}").json()
    assert ready["status"] == PlanStatus.READY.value
    assert provider.calls.count("session_content") - content_calls_before_resume == (
        len(failed_plan["sessions"]) - 1
    )
    with SessionLocal() as db:
        first_session = db.get(StudySession, first_session_id)
        assert first_session.material.id == first_material_id
        assert first_session.quiz.id == first_quiz_id
        assert first_session.quiz.assessment_revision == first_revision
        for session_id in (item["id"] for item in ready["sessions"]):
            session = db.get(StudySession, session_id)
            assert session.material is not None and session.quiz is not None
            assert len(session.quiz.questions) == 5


def test_v2_resume_fails_closed_on_partial_historical_publication(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    provider = _CountingMock()
    monkeypatch.setattr("app.services.plan_service.get_llm_provider", lambda *_args: provider)
    monkeypatch.setattr(
        "app.services.plan_service.Retriever.retrieve_texts",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("v2 plans without document IDs must not retrieve user documents")
        ),
    )
    goal_id = _goal(client, "LEARNING")
    plan_id, ready_plan = _generate(client, goal_id)
    session_id = ready_plan["sessions"][0]["id"]

    with SessionLocal() as db:
        plan = db.get(Plan, plan_id)
        session = db.get(StudySession, session_id)
        assert plan is not None and session is not None and session.material is not None
        material_id = session.material.id
        db.delete(session.quiz)
        plan.status = PlanStatus.FAILED
        db.commit()
    provider.calls.clear()

    resumed = client.post(f"/plans/{plan_id}/resume")

    assert resumed.status_code == 202
    assert client.get(f"/plans/{plan_id}/status").json()["status"] == PlanStatus.FAILED.value
    assert provider.calls == []
    with SessionLocal() as db:
        session = db.get(StudySession, session_id)
        assert session.material.id == material_id
        assert session.quiz is None


@pytest.mark.parametrize(
    "topic,expected_profile",
    [
        ("Álgebra", "logical_deductive"),
        ("Matemática", "logical_deductive"),
        ("Física", "logical_deductive"),
        ("Programación", "logical_deductive"),
        ("Fracciones", "logical_deductive"),
        ("Historia", "critical_argumentative"),
        ("Filosofía", "critical_argumentative"),
        ("Fuentes", "critical_argumentative"),
        ("Literatura", "linguistic_interpretive"),
        ("Idioma", "linguistic_interpretive"),
        ("Lingüística", "linguistic_interpretive"),
        ("Biología", "systemic_empirical"),
        ("Química", "systemic_empirical"),
        ("Economía", "applied_practical"),
        ("Negocio", "applied_practical"),
        ("BIOLOGÍA", "systemic_empirical"),
        ("Asunto desconocido", "general"),
    ],
)
def test_v2_mock_topic_profiles_use_accent_insensitive_discipline_cues(
    topic: str, expected_profile: str
):
    topics = MockLLMProvider()._topics({"content_version": 2, "keywords": [topic]})["topics"]

    assert topics[0]["topic_profile"] == expected_profile
    assert topics[0]["objectives"][0]["bloom_target"] == "understand"


@pytest.mark.parametrize(
    "profile_id",
    [
        "logical_deductive",
        "critical_argumentative",
        "linguistic_interpretive",
        "systemic_empirical",
        "applied_practical",
        "general",
    ],
)
def test_v2_mock_assessment_hides_keys_and_uses_profile_compatible_formative_questions(
    profile_id: str,
):
    profile = resolve_profile(profile_id, None)
    objective = LearningObjective(
        id="objective-1",
        skill="Explain the topic",
        description="Explain the topic using its core relationship.",
        bloom_target="understand",
    )
    snapshot = snapshot_profile(profile, [objective])
    config = GoalStrategyFactory.create(GoalType.LEARNING).get_session_config()
    data = MockLLMProvider()._session_content(
        {
            "content_version": 2,
            "pedagogy_snapshot": snapshot.model_dump(mode="json"),
            "topic": "Tema de estudio",
            "goal_title": "Comprender",
            "flashcards": config.flashcards,
            "multiple_choice": config.multiple_choice,
        }
    )

    multiple_choice = [question for question in data["questions"] if question["kind"] == "multiple_choice"]
    positions = [question["options"].index(question["expected_answer"]) for question in multiple_choice]
    assert positions[0] == 1
    assert len(set(positions)) > 1
    assert all("Relaciona la idea central" in question["expected_answer"] for question in multiple_choice)
    assert all(
        not any(word in option.casefold() for word in ("correcta", "correcto", "alternativa", "simulada"))
        for question in multiple_choice
        for option in question["options"]
    )

    second_kind = {
        "logical_deductive": "step_by_step",
        "critical_argumentative": "essay",
        "linguistic_interpretive": "essay",
        "systemic_empirical": "matching",
        "applied_practical": "step_by_step",
        "general": "true_false",
    }[profile_id]
    assert data["questions"][1]["kind"] == second_kind
    assert "worked_example" not in data["lesson_blocks"][0]["content_markdown"]

    if profile_id in {"critical_argumentative", "linguistic_interpretive"}:
        essay = data["questions"][1]
        assert essay["kind"] == "essay"
        assert essay["rubric_criteria"]
        assert all(criterion["descriptors"] for criterion in essay["rubric_criteria"])
        assert essay["exemplar"]
        assert "essay" in profile.allowed_question_types
    elif profile_id == "logical_deductive":
        assert "2 × x = 2" in data["questions"][1]["prompt"]
        assert data["questions"][1]["expected_answer"] == "1"
    elif profile_id == "applied_practical":
        case_prompt = data["questions"][1]["prompt"]
        assert "presupuesto de 10" in case_prompt
        assert "A cuesta 4" in case_prompt and "B cuesta 6" in case_prompt

    built = build_adaptive_session_content(data, config, snapshot, {})
    assert built.draft.adaptive_assessment.questions


def test_v2_mock_does_not_interpolate_markup_or_urls_from_goal_title():
    objective = LearningObjective(
        id="objective-1",
        skill="Explain the topic",
        description="Explain the topic using its core relationship.",
        bloom_target="understand",
    )
    snapshot = snapshot_profile(resolve_profile("general", None), [objective])
    config = GoalStrategyFactory.create(GoalType.LEARNING).get_session_config()
    data = MockLLMProvider()._session_content(
        {
            "content_version": 2,
            "pedagogy_snapshot": snapshot.model_dump(mode="json"),
            "topic": "Programación",
            "goal_title": "Aprender <strong> y https://example.test",
            "flashcards": config.flashcards,
            "multiple_choice": config.multiple_choice,
        }
    )

    built = build_adaptive_session_content(data, config, snapshot, {})

    assert all(
        "<strong>" not in block.content_markdown
        and "https://example.test" not in block.content_markdown
        for block in built.draft.lesson_blocks
    )
