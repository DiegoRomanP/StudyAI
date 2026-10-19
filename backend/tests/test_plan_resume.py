"""Resuming an incomplete plan generates only what is missing."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

import main
from app.core.exceptions import LLMError
from app.db.session import SessionLocal
from app.llm.mock_provider import MockLLMProvider
from app.models.plan import Plan, PlanStatus
from app.services import plan_service
from tests.test_default_free_provider import _free_ai_client, _goal, _reset_usage
from tests.test_free_ai_refund import _uses


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


class _Counting(MockLLMProvider):
    """The mock; fails ``session_content`` from the ``fail_from``-th distinct topic on."""

    def __init__(self, fail_from: int | None = None, fail_kind: str | None = None) -> None:
        super().__init__()
        self.fail_from, self.fail_kind = fail_from, fail_kind
        self.calls: list[str] = []
        self.topics: list[str] = []

    def complete(self, *, kind, context=None, **kwargs):
        self.calls.append(kind)
        if kind == self.fail_kind:
            raise LLMError("El proveedor de IA no está disponible temporalmente.", code="LLM_PROVIDER_UNAVAILABLE")
        if kind == "session_content" and self.fail_from is not None:
            topic = (context or {}).get("topic")
            if topic not in self.topics:
                self.topics.append(topic)
            if self.topics.index(topic) + 1 >= self.fail_from:
                raise LLMError("sin espacio", code="LLM_OUTPUT_LIMIT")
        return super().complete(kind=kind, context=context, **kwargs)


def _use(monkeypatch, provider: MockLLMProvider) -> MockLLMProvider:
    monkeypatch.setattr(plan_service, "get_llm_provider", lambda *_: provider)
    return provider


def _failed_plan(client: TestClient, monkeypatch, provider: _Counting, title: str, **headers) -> dict:
    _use(monkeypatch, provider)
    goal_id = client.post(
        "/goals", json={"goal_type": "LEARNING", "title": title, "description": ""}
    ).json()["id"]
    md = "# Tema\n\n" + "Contenido de prueba para el plan. " * 200
    files = {"file": (f"{title}.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    response = client.post(
        "/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]}, headers=headers
    )
    plan = client.get(f"/plans/{response.json()['id']}").json()
    assert plan["status"] == "FAILED"
    return plan


def _with_material(plan_id: int) -> set[int]:
    with SessionLocal() as db:
        return {s.id for s in db.get(Plan, plan_id).sessions if s.material is not None}


def test_resume_generates_only_the_missing_sessions(client, monkeypatch):
    failed = _failed_plan(client, monkeypatch, _Counting(fail_from=2), "Reanudar sesión 2")
    done_before = _with_material(failed["id"])
    assert len(done_before) == 1 and len(failed["sessions"]) == 3

    provider = _use(monkeypatch, _Counting())
    response = client.post(f"/plans/{failed['id']}/resume")
    plan = client.get(f"/plans/{failed['id']}").json()

    assert response.status_code == 202
    assert response.json()["status"] == "PROCESSING"
    assert plan["status"] == "READY"
    assert plan["error_message"] == ""
    assert [t["id"] for t in plan["topics"]] == [t["id"] for t in failed["topics"]]
    assert [s["id"] for s in plan["sessions"]] == [s["id"] for s in failed["sessions"]]
    assert done_before <= _with_material(plan["id"])
    assert provider.calls == ["session_content"] * 2
    assert plan["progress_done"] == plan["progress_total"] == 3


def test_a_plan_like_the_one_that_failed_at_its_third_session_needs_one_call(client, monkeypatch):
    failed = _failed_plan(client, monkeypatch, _Counting(fail_from=3), "Reanudar sesión 3")
    assert (failed["progress_done"], failed["progress_total"]) == (2, 3)

    provider = _use(monkeypatch, _Counting())
    client.post(f"/plans/{failed['id']}/resume")

    assert client.get(f"/plans/{failed['id']}").json()["status"] == "READY"
    assert provider.calls == ["session_content"]


def test_a_plan_without_topics_runs_the_full_pipeline(client, monkeypatch):
    failed = _failed_plan(client, monkeypatch, _Counting(fail_kind="topic_analysis"), "Reanudar sin temas")
    assert failed["topics"] == []

    provider = _use(monkeypatch, _Counting())
    client.post(f"/plans/{failed['id']}/resume")
    plan = client.get(f"/plans/{failed['id']}").json()

    assert plan["status"] == "READY"
    assert len(provider.calls) == 2 + len(plan["sessions"])


def _fail_directly(plan_id: int, message: str = "La generación quedó incompleta.") -> None:
    with SessionLocal() as db:
        db.execute(
            update(Plan)
            .where(Plan.id == plan_id)
            .values(status=PlanStatus.FAILED, error_message=message, free_ai_use_date=None)
        )
        db.commit()


def _free_failed_plan(client: TestClient, message: str = "La generación quedó incompleta.") -> int:
    """A FAILED plan whose spent use was already given back."""
    _reset_usage()
    client.post("/llm-settings/deactivate-all")
    plan_id = client.post("/plans/generate", json={"goal_id": _goal(client), "document_ids": []}).json()["id"]
    _fail_directly(plan_id, message)
    _reset_usage()
    return plan_id


def _record_resume_tasks(monkeypatch) -> list[int]:
    started: list[int] = []
    monkeypatch.setattr("app.api.v1.routes.plans.generate_plan_task", started.append)
    return started


def test_a_double_resume_starts_one_task_and_spends_one_use(monkeypatch):
    with _free_ai_client(monkeypatch) as client:
        plan_id = _free_failed_plan(client)
        started = _record_resume_tasks(monkeypatch)

        first = client.post(f"/plans/{plan_id}/resume")
        second = client.post(f"/plans/{plan_id}/resume")

        assert (first.status_code, second.status_code) == (202, 202)
        assert first.json()["status"] == second.json()["status"] == "PROCESSING"
        assert started == [plan_id]
        assert _uses() == 1


def test_resume_over_the_daily_limit_is_429_and_keeps_the_plan_failed_with_its_message(monkeypatch):
    with _free_ai_client(monkeypatch, limit=1) as client:
        plan_id = _free_failed_plan(client, "Mensaje anterior")
        client.post("/plans/generate", json={"goal_id": _goal(client), "document_ids": []})  # spends the only use
        started = _record_resume_tasks(monkeypatch)

        refused = client.post(f"/plans/{plan_id}/resume")

        assert refused.status_code == 429
        assert refused.json()["code"] == "FREE_AI_DAILY_LIMIT"
        assert started == []
        status = client.get(f"/plans/{plan_id}/status").json()
        assert (status["status"], status["error_message"]) == ("FAILED", "Mensaje anterior")


def test_a_resume_that_fails_again_gives_the_use_back(monkeypatch):
    with _free_ai_client(monkeypatch) as client:
        plan_id = _free_failed_plan(client)
        _record_resume_tasks(monkeypatch)
        client.post(f"/plans/{plan_id}/resume")
        assert _uses() == 1

        _use(monkeypatch, _Counting(fail_kind="topic_analysis"))
        plan_service.generate_plan_task(plan_id)

        assert client.get(f"/plans/{plan_id}/status").json()["status"] == "FAILED"
        assert _uses() == 0


def test_a_ready_plan_cannot_be_resumed(client):
    goal_id = client.post(
        "/goals", json={"goal_type": "LEARNING", "title": "Plan listo", "description": ""}
    ).json()["id"]
    plan_id = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": []}).json()["id"]
    assert client.get(f"/plans/{plan_id}/status").json()["status"] == "READY"

    refused = client.post(f"/plans/{plan_id}/resume")

    assert refused.status_code == 409
    assert refused.json()["code"] == "PLAN_NOT_RESUMABLE"


def test_unknown_plan_is_404(client):
    assert client.post("/plans/999999/resume").status_code == 404


def test_replaying_generate_does_not_resume_a_failed_plan(client, monkeypatch):
    failed = _failed_plan(
        client, monkeypatch, _Counting(fail_from=2), "Repetir generar", **{"Idempotency-Key": "resume-replay"}
    )
    provider = _use(monkeypatch, _Counting())

    replay = client.post(
        "/plans/generate",
        json={"goal_id": failed["goal_id"], "document_ids": failed["document_ids"]},
        headers={"Idempotency-Key": "resume-replay"},
    )

    assert replay.json()["id"] == failed["id"]
    assert replay.json()["status"] == "FAILED"
    assert provider.calls == []
