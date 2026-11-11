"""Review generation keeps the current v2 assessment until publication."""

from datetime import date

import pytest

import main
from app.models.quiz import Quiz
from app.models.session import Session
from app.services import reinforcement_service
from tests.test_adaptive_assessment import _answers, _submit, assessment, client


def _state(client, session_id):
    return client.get(f"/sessions/{session_id}").json()["reinforcement_status"]


def _assessment(client, session_id):
    response = client.get(f"/quizzes/{session_id}/assessment-v2")
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def captured_jobs(monkeypatch):
    jobs = []
    monkeypatch.setattr(
        "app.api.v1.routes.sessions.generate_reinforcement_task", lambda *args: jobs.append(args)
    )
    return jobs


def test_cancel_then_restart_does_not_let_old_job_claim_the_new_run(
    client, assessment, captured_jobs, monkeypatch
):
    session_id, quiz_id, _, _ = assessment
    initial = _assessment(client, session_id)
    refunds = []
    provider_requests = []

    monkeypatch.setattr(reinforcement_service, "uses_free_ai", lambda *args: True)
    monkeypatch.setattr(
        reinforcement_service.FreeAiQuota, "consume", lambda *args: date(2026, 11, 11)
    )
    monkeypatch.setattr(
        reinforcement_service.FreeAiQuota, "refund", lambda *args: refunds.append(args[-1])
    )

    def request_provider(*args):
        provider_requests.append(args)
        raise RuntimeError("A stale run should exit before selecting a provider.")

    monkeypatch.setattr(reinforcement_service, "get_llm_provider", request_provider)
    start = f"/sessions/{session_id}/reinforcement"
    assert client.post(start).status_code == 202
    assert client.post(start).status_code == 202
    assert len(captured_jobs) == 1
    assert client.post(f"{start}/cancel").json()["reinforcement_status"] == "NONE"
    assert client.post(start).status_code == 202
    assert len(captured_jobs) == 2
    first, second = captured_jobs
    assert len(first) == len(second) == 4
    assert first[-1] != second[-1]

    reinforcement_service.generate_reinforcement_task(*first)
    assert refunds == [date(2026, 11, 11)]
    assert provider_requests == []
    assert _state(client, session_id) == "PROCESSING"
    assert _assessment(client, session_id) == initial
    with main.SessionLocal() as db:
        assert db.get(Quiz, quiz_id).assessment_revision == initial["revision"]


def test_submitting_a_review_invalidates_its_active_job(client, assessment, captured_jobs, monkeypatch):
    session_id, quiz_id, card_id, legacy_id = assessment
    assert client.post(f"/sessions/{session_id}/reinforcement").status_code == 202
    assert _submit(client, quiz_id, _answers(card_id, legacy_id)).status_code == 200
    assert _state(client, session_id) == "NONE"
    with main.SessionLocal() as db:
        assert db.get(Session, session_id).reinforcement_run_token is None

    def unexpected_provider(*args):
        pytest.fail("A completed review must not call the provider.")

    monkeypatch.setattr(reinforcement_service, "get_llm_provider", unexpected_provider)
    reinforcement_service.generate_reinforcement_task(*captured_jobs[0])
    assert _state(client, session_id) == "NONE"


def test_an_old_failure_cannot_mark_a_restarted_run_failed(
    client, assessment, captured_jobs, monkeypatch
):
    from app.core.exceptions import LLMError

    session_id, _, _, _ = assessment
    initial = _assessment(client, session_id)
    start = f"/sessions/{session_id}/reinforcement"

    def cancel_restart_then_fail(*args):
        assert client.post(f"{start}/cancel").status_code == 200
        assert client.post(start).status_code == 202
        raise LLMError("Error de la ejecución anterior.", code="LLM_PROVIDER_ERROR")

    monkeypatch.setattr(reinforcement_service, "get_llm_provider", cancel_restart_then_fail)
    assert client.post(start).status_code == 202
    reinforcement_service.generate_reinforcement_task(*captured_jobs[0])

    assert len(captured_jobs) == 2
    assert _state(client, session_id) == "PROCESSING"
    assert _assessment(client, session_id) == initial


def test_failed_refuerzo_keeps_published_learning_and_assessment(
    client, assessment, captured_jobs, monkeypatch
):
    from app.llm.mock_provider import MockLLMProvider

    class InvalidProvider(MockLLMProvider):
        def complete(self, **kwargs):
            return "{}"

    session_id, _, _, _ = assessment
    before_lesson = client.get(f"/sessions/{session_id}/learning-v2").json()
    before_assessment = _assessment(client, session_id)
    monkeypatch.setattr(reinforcement_service, "get_llm_provider", lambda *args: InvalidProvider())
    assert client.post(f"/sessions/{session_id}/reinforcement").status_code == 202
    reinforcement_service.generate_reinforcement_task(*captured_jobs[0])

    assert _state(client, session_id) == "FAILED"
    assert client.get(f"/sessions/{session_id}/learning-v2").json() == before_lesson
    assert _assessment(client, session_id) == before_assessment


def test_published_refuerzo_preserves_snapshot_quiz_identity_and_reopens_revision(
    client, assessment, captured_jobs, monkeypatch
):
    from app.llm.mock_provider import MockLLMProvider
    from app.models.flashcard import FlashcardReview
    from app.models.goal import GoalType

    class RecordingMock(MockLLMProvider):
        calls = []

        def complete(self, **kwargs):
            self.calls.append(kwargs["kind"])
            return super().complete(**kwargs)

    session_id, quiz_id, card_id, legacy_id = assessment
    before_lesson = client.get(f"/sessions/{session_id}/learning-v2").json()
    before_assessment = _assessment(client, session_id)
    with main.SessionLocal() as db:
        plan = db.get(Session, session_id).plan
        plan.generation_goal_type = GoalType.MEMORIZATION.value
        plan.goal.goal_type = GoalType.EXAM
        db.add(FlashcardReview(question_id=card_id, user_id=1))
        db.commit()
    provider = RecordingMock()
    monkeypatch.setattr(reinforcement_service, "get_llm_provider", lambda *args: provider)

    assert client.post(f"/sessions/{session_id}/reinforcement").status_code == 202
    assert _assessment(client, session_id) == before_assessment
    reinforcement_service.generate_reinforcement_task(*captured_jobs[0])

    assert provider.calls == ["session_content"]
    assert _state(client, session_id) == "READY"
    assert client.get(f"/sessions/{session_id}/learning-v2").json()["snapshot"] == before_lesson["snapshot"]
    after = _assessment(client, session_id)
    assert after["quiz_id"] == quiz_id
    assert after["revision"] != before_assessment["revision"]
    assert len(after["questions"]) == 10
    assert sum(question["kind"] == "flashcard" for question in after["questions"]) == 8
    stale = _submit(client, quiz_id, _answers(card_id, legacy_id), before_assessment["revision"])
    assert (stale.status_code, stale.json()["code"]) == (409, "QUIZ_OUTDATED")
    with main.SessionLocal() as db:
        assert db.get(Quiz, quiz_id).assessment_state == "open"
        assert db.query(FlashcardReview).filter_by(question_id=card_id).count() == 0


def test_run_token_backfill_is_additive_for_old_sessions(monkeypatch):
    from sqlalchemy import create_engine, text

    from app.db import init_db as init_db_module

    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE sessions (id INTEGER PRIMARY KEY, topic_name TEXT)"))
            connection.execute(text("INSERT INTO sessions VALUES (1, 'Repaso histórico')"))
        monkeypatch.setattr(init_db_module, "engine", engine)
        init_db_module._ensure_adaptive_route_columns()
        init_db_module._ensure_adaptive_route_columns()
        with engine.connect() as connection:
            row = connection.execute(text(
                "SELECT topic_name, reinforcement_status, reinforcement_run_token FROM sessions"
            )).one()
        assert tuple(row) == ("Repaso histórico", "NONE", None)
    finally:
        engine.dispose()


def test_failed_publication_rolls_back_replaced_cards_and_material(
    client, assessment, captured_jobs, monkeypatch
):
    from app.models.flashcard import FlashcardReview

    session_id, _, card_id, _ = assessment
    before = _assessment(client, session_id)
    before_lesson = client.get(f"/sessions/{session_id}/learning-v2").json()
    with main.SessionLocal() as db:
        db.add(FlashcardReview(question_id=card_id, user_id=1))
        db.commit()

    publish = reinforcement_service._publish_adaptive_content

    def publish_then_fail(*args):
        publish(*args)
        raise RuntimeError("Simulated failure before commit")

    monkeypatch.setattr(
        reinforcement_service, "_generate_adaptive_content",
        lambda db, *args: _candidate_content(db, session_id),
    )
    monkeypatch.setattr(reinforcement_service, "_publish_adaptive_content", publish_then_fail)
    assert client.post(f"/sessions/{session_id}/reinforcement").status_code == 202
    reinforcement_service.generate_reinforcement_task(*captured_jobs[0])
    assert _state(client, session_id) == "FAILED"
    assert _assessment(client, session_id) == before
    assert client.get(f"/sessions/{session_id}/learning-v2").json() == before_lesson
    with main.SessionLocal() as db:
        assert db.query(FlashcardReview).filter_by(question_id=card_id).count() == 1


def test_valid_old_result_cannot_publish_after_restart(client, assessment, captured_jobs, monkeypatch):
    session_id, _, _, _ = assessment
    before = _assessment(client, session_id)
    start = f"/sessions/{session_id}/reinforcement"

    def build_after_restart(db, *args):
        candidate = _candidate_content(db, session_id)
        assert client.post(f"{start}/cancel").status_code == 200
        assert client.post(start).status_code == 202
        return candidate

    monkeypatch.setattr(reinforcement_service, "_generate_adaptive_content", build_after_restart)
    assert client.post(start).status_code == 202
    reinforcement_service.generate_reinforcement_task(*captured_jobs[0])
    assert len(captured_jobs) == 2
    assert _state(client, session_id) == "PROCESSING"
    assert _assessment(client, session_id) == before


def _candidate_content(db, session_id):
    from app.repositories.adaptive_content_repository import AdaptiveContentRepository
    from app.services.adaptive_content_builder import AdaptiveBuiltContent

    draft = AdaptiveContentRepository(db).get(session_id)
    return AdaptiveBuiltContent(
        content_markdown="Material candidato.",
        keywords=["refuerzo"],
        flashcards=[{"prompt": "Nueva tarjeta", "answer": "Nueva respuesta", "objective_ids": ["a"]}],
        draft=draft.model_copy(update={"assessment_revision": "next-revision"}),
    )
