"""AI reinforcement of a review session: state machine, free-AI quota and races."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

import main
from app.core import config as config_module
from app.core.config import Settings
from app.core.exceptions import LLMError
from app.db.session import SessionLocal
from app.llm import factory
from app.llm.mock_provider import MockLLMProvider
from app.models.free_ai_usage import FreeAiUsage
from app.services import free_ai_quota, reinforcement_service
from app.services.reinforcement_service import generate_reinforcement_task
from tests.test_adaptive_route_flow import _plan, _refresh, _reviews, _take

USER_ID = 1


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def created_plans(client: TestClient):
    plan_ids: list[int] = []
    yield plan_ids
    for plan_id in plan_ids:
        client.delete(f"/plans/{plan_id}")


@pytest.fixture
def tasks(monkeypatch) -> list[tuple]:
    """Replace the background task with a recorder so each test runs it by hand."""
    recorded: list[tuple] = []
    monkeypatch.setattr(
        "app.api.v1.routes.sessions.generate_reinforcement_task", lambda *args: recorded.append(args)
    )
    return recorded


class _Scripted(MockLLMProvider):
    def __init__(self, reply: str | None = None, error: Exception | None = None) -> None:
        self.reply, self.error, self.calls = reply, error, 0

    def complete(self, **kwargs):
        self.calls += 1
        if self.error is not None:
            raise self.error
        if self.reply is not None:
            return self.reply
        return super().complete(**kwargs)


def _review(client: TestClient, created_plans: list[int], title: str) -> tuple[dict, int]:
    """A plan whose first session was failed on purpose; returns (plan, pending review id)."""
    plan = _plan(client, created_plans, title)
    first = plan["sessions"][0]
    _take(client, first["id"], "bad")
    plan = _refresh(client, plan)
    [review] = _reviews(plan, first["topic_id"])
    return plan, review["id"]


def _bundled(monkeypatch, *, limit: int = 3, own_key: bool = False) -> None:
    settings = Settings(
        NVIDIA_API_KEY="nvapi-test",
        GEMINI_API_KEY="gem-test",
        FREE_AI_DAILY_LIMIT=limit,
        ANTHROPIC_API_KEY="anthropic-test" if own_key else "",
    )
    for module in (factory, free_ai_quota, config_module):
        monkeypatch.setattr(module, "get_settings", lambda: settings)


def _use_provider(monkeypatch, provider: MockLLMProvider) -> _Scripted:
    monkeypatch.setattr(reinforcement_service, "get_llm_provider", lambda *_: provider)
    return provider


def _uses() -> int:
    with SessionLocal() as db:
        return sum(row.uses for row in db.query(FreeAiUsage).all())


def _reset_usage() -> None:
    with SessionLocal() as db:
        db.query(FreeAiUsage).delete()
        db.commit()


def _detail(client: TestClient, session_id: int) -> dict:
    return client.get(f"/sessions/{session_id}").json()


def _quiz_size(client: TestClient, session_id: int) -> int:
    return len(client.get(f"/quizzes/{session_id}").json()["questions"])


def test_mock_reinforcement_replaces_material_and_quiz_without_spending(client, created_plans):
    _reset_usage()
    _, review_id = _review(client, created_plans, "Refuerzo demo")
    before = client.get(f"/quizzes/{review_id}").json()

    response = client.post(f"/sessions/{review_id}/reinforcement")

    assert response.status_code == 202
    assert response.json()["reinforcement_status"] == "PROCESSING"
    detail = _detail(client, review_id)  # the TestClient already ran the background task
    assert detail["reinforcement_status"] == "READY"
    assert detail["material"]["content_markdown"].startswith("# Refuerzo:")
    after = client.get(f"/quizzes/{review_id}").json()
    assert len(after["questions"]) == len(before["questions"])
    assert all(q["prompt"].startswith("Refuerzo:") for q in after["questions"])
    assert _uses() == 0


def test_bundled_reinforcement_spends_one_use(client, created_plans, monkeypatch, tasks):
    _, review_id = _review(client, created_plans, "Refuerzo gratis")
    _reset_usage()
    _bundled(monkeypatch)
    client.post("/llm-settings/deactivate-all")
    provider = _use_provider(monkeypatch, _Scripted())

    assert client.post(f"/sessions/{review_id}/reinforcement").status_code == 202
    assert len(tasks) == 1
    assert tasks[0][2] is True  # spent
    generate_reinforcement_task(*tasks[0])

    assert _uses() == 1
    assert provider.calls == 1
    assert _detail(client, review_id)["reinforcement_status"] == "READY"


def test_own_key_never_spends(client, created_plans, monkeypatch, tasks):
    _, review_id = _review(client, created_plans, "Refuerzo clave propia")
    _reset_usage()
    _bundled(monkeypatch, own_key=True)
    client.post("/llm-settings/deactivate-all")
    _use_provider(monkeypatch, _Scripted())

    assert client.post(f"/sessions/{review_id}/reinforcement").status_code == 202
    assert tasks[0][2] is False
    generate_reinforcement_task(*tasks[0])

    assert _uses() == 0


def test_reinforcement_rejected_for_new_completed_or_ready_session(client, created_plans):
    plan, review_id = _review(client, created_plans, "Refuerzo no disponible")
    new_session = next(s for s in plan["sessions"] if s["kind"] == "NEW")

    rejected = client.post(f"/sessions/{new_session['id']}/reinforcement")
    assert rejected.status_code == 409
    assert rejected.json()["code"] == "REINFORCEMENT_NOT_AVAILABLE"

    assert client.post(f"/sessions/{review_id}/reinforcement").status_code == 202  # runs to READY
    assert _detail(client, review_id)["reinforcement_status"] == "READY"
    assert client.post(f"/sessions/{review_id}/reinforcement").status_code == 409

    _take(client, review_id, "good")  # now COMPLETED
    assert client.post(f"/sessions/{review_id}/reinforcement").status_code == 409
    assert client.post("/sessions/999999/reinforcement").status_code == 404


def test_processing_replay_is_idempotent_and_makes_no_new_call(client, created_plans, tasks):
    _, review_id = _review(client, created_plans, "Refuerzo repetido")

    first = client.post(f"/sessions/{review_id}/reinforcement")
    second = client.post(f"/sessions/{review_id}/reinforcement")

    assert first.status_code == second.status_code == 202
    assert second.json()["reinforcement_status"] == "PROCESSING"
    assert len(tasks) == 1


def test_two_posts_spend_one_use_and_start_one_task(client, created_plans, monkeypatch, tasks):
    _, review_id = _review(client, created_plans, "Refuerzo doble")
    _reset_usage()
    _bundled(monkeypatch)
    client.post("/llm-settings/deactivate-all")

    client.post(f"/sessions/{review_id}/reinforcement")
    client.post(f"/sessions/{review_id}/reinforcement")

    assert _uses() == 1
    assert len(tasks) == 1


def test_reinforcement_at_daily_limit_returns_429_and_keeps_status_none(client, created_plans, monkeypatch, tasks):
    _, review_id = _review(client, created_plans, "Refuerzo sin cupo")
    _reset_usage()
    _bundled(monkeypatch, limit=1)
    client.post("/llm-settings/deactivate-all")
    with SessionLocal() as db:
        free_ai_quota.FreeAiQuota(db).consume(USER_ID)

    response = client.post(f"/sessions/{review_id}/reinforcement")

    assert response.status_code == 429
    assert response.json()["code"] == "FREE_AI_DAILY_LIMIT"
    assert _detail(client, review_id)["reinforcement_status"] == "NONE"
    assert tasks == []
    assert _uses() == 1


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (LLMError("La cuota del proveedor se agotó.", code="LLM_QUOTA_EXHAUSTED"), "La cuota del proveedor se agotó."),
        (RuntimeError("secret upstream body"), "No se pudo generar el refuerzo. Inténtalo de nuevo."),
    ],
)
def test_llm_failure_marks_failed_with_safe_message_and_refunds(
    client, created_plans, monkeypatch, tasks, error, expected
):
    _, review_id = _review(client, created_plans, "Refuerzo fallido")
    _reset_usage()
    _bundled(monkeypatch)
    client.post("/llm-settings/deactivate-all")
    _use_provider(monkeypatch, _Scripted(error=error))
    client.post(f"/sessions/{review_id}/reinforcement")
    assert _uses() == 1

    generate_reinforcement_task(*tasks[0])

    detail = _detail(client, review_id)
    assert detail["reinforcement_status"] == "FAILED"
    assert detail["reinforcement_error"] == expected
    assert "secret" not in detail["reinforcement_error"]
    assert _uses() == 0
    # A failed reinforcement can be retried.
    assert client.post(f"/sessions/{review_id}/reinforcement").status_code == 202


@pytest.mark.parametrize(
    "reply",
    [
        json.dumps({"summary_markdown": "", "flashcards": [], "multiple_choice": []}),
        json.dumps({"summary_markdown": "Texto sin preguntas"}),
        "esto no es JSON",
    ],
)
def test_invalid_or_empty_ai_output_fails_and_keeps_copies(client, created_plans, monkeypatch, tasks, reply):
    _, review_id = _review(client, created_plans, "Refuerzo vacío")
    original = client.get(f"/quizzes/{review_id}").json()
    _use_provider(monkeypatch, _Scripted(reply=reply))
    client.post(f"/sessions/{review_id}/reinforcement")

    generate_reinforcement_task(*tasks[0])

    assert _detail(client, review_id)["reinforcement_status"] == "FAILED"
    assert client.get(f"/quizzes/{review_id}").json() == original


def test_long_error_is_truncated_to_1000(client, created_plans, monkeypatch, tasks):
    _, review_id = _review(client, created_plans, "Refuerzo error largo")
    _use_provider(monkeypatch, _Scripted(error=LLMError("x" * 2000, code="LLM_PROVIDER_ERROR")))
    client.post(f"/sessions/{review_id}/reinforcement")

    generate_reinforcement_task(*tasks[0])

    assert len(_detail(client, review_id)["reinforcement_error"]) == 1000


def test_cancel_then_late_task_write_is_discarded_and_refunded_once(client, created_plans, monkeypatch, tasks):
    _, review_id = _review(client, created_plans, "Refuerzo cancelado")
    original = client.get(f"/quizzes/{review_id}").json()
    _reset_usage()
    _bundled(monkeypatch)
    client.post("/llm-settings/deactivate-all")
    _use_provider(monkeypatch, _Scripted())
    client.post(f"/sessions/{review_id}/reinforcement")
    assert _uses() == 1

    cancelled = client.post(f"/sessions/{review_id}/reinforcement/cancel")
    assert cancelled.json()["reinforcement_status"] == "NONE"
    assert _uses() == 1  # cancelling alone does not refund
    generate_reinforcement_task(*tasks[0])

    assert _detail(client, review_id)["reinforcement_status"] == "NONE"
    assert client.get(f"/quizzes/{review_id}").json() == original
    assert _uses() == 0
    # Cancelling when nothing is processing is a no-op.
    assert client.post(f"/sessions/{review_id}/reinforcement/cancel").json()["reinforcement_status"] == "NONE"


def test_task_after_plan_deleted_refunds_without_error(client, created_plans, monkeypatch, tasks):
    plan, review_id = _review(client, created_plans, "Refuerzo plan borrado")
    _reset_usage()
    _bundled(monkeypatch)
    client.post("/llm-settings/deactivate-all")
    client.post(f"/sessions/{review_id}/reinforcement")
    assert _uses() == 1
    assert client.delete(f"/plans/{plan['id']}").status_code == 204

    generate_reinforcement_task(*tasks[0])

    assert _uses() == 0


def test_submit_with_unknown_question_ids_is_rejected_without_result(client, created_plans):
    from app.models.quiz import QuizResult

    plan = _plan(client, created_plans, "Envío con preguntas viejas")
    first = plan["sessions"][0]
    quiz = client.get(f"/quizzes/{first['id']}").json()
    answers = [{"question_id": 987654, "quality": 3}]
    answers += [
        {"question_id": q["id"], "quality": 3} if q["question_type"] == "FLASHCARD"
        else {"question_id": q["id"], "selected_option": q["answer"]}
        for q in quiz["questions"]
    ]

    response = client.post(f"/quizzes/{quiz['id']}/submit", json={"answers": answers})

    assert response.status_code == 409
    assert response.json()["code"] == "QUIZ_OUTDATED"
    assert _detail(client, first["id"])["status"] == "PENDING"
    with SessionLocal() as db:
        assert db.query(QuizResult).filter(QuizResult.session_id == first["id"]).count() == 0


class _OutputLimitBelow(MockLLMProvider):
    def __init__(self, below: int) -> None:
        super().__init__()
        self.below = below
        self.budgets: list[int] = []

    def complete(self, *, max_tokens=4096, **kwargs):
        self.budgets.append(max_tokens)
        if max_tokens < self.below:
            raise LLMError("sin espacio", code="LLM_OUTPUT_LIMIT")
        return super().complete(max_tokens=max_tokens, **kwargs)


def test_reinforcement_retries_once_at_8192(client, created_plans, monkeypatch, tasks):
    _, review_id = _review(client, created_plans, "Refuerzo con reintento")
    provider = _use_provider(monkeypatch, _OutputLimitBelow(8192))
    client.post(f"/sessions/{review_id}/reinforcement")

    generate_reinforcement_task(*tasks[0])

    assert _detail(client, review_id)["reinforcement_status"] == "READY"
    assert provider.budgets == [4096, 8192]


def test_reinforcement_fails_cleanly_after_the_retry(client, created_plans, monkeypatch, tasks):
    _, review_id = _review(client, created_plans, "Refuerzo sin espacio")
    _reset_usage()
    _bundled(monkeypatch)
    client.post("/llm-settings/deactivate-all")
    provider = _use_provider(monkeypatch, _OutputLimitBelow(10**6))
    client.post(f"/sessions/{review_id}/reinforcement")
    assert _uses() == 1

    generate_reinforcement_task(*tasks[0])

    assert _detail(client, review_id)["reinforcement_status"] == "FAILED"
    assert provider.budgets == [4096, 8192]
    assert _uses() == 0
