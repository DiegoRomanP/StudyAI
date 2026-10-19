"""Step-by-step plan generation: progress, partial results and no eternal PROCESSING."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

import main
from app.core.exceptions import LLMError
from app.db.session import SessionLocal
from app.llm.mock_provider import MockLLMProvider
from app.models.plan import Plan, PlanTopic
from app.models.quiz import Quiz
from app.models.session import Session as StudySession
from app.models.session import SessionMaterial
from app.services import plan_service
from app.services.plan_service import PlanService

USER_ID = 1


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


class _Scripted(MockLLMProvider):
    """The mock, plus a hook that may raise or act before each call."""

    def __init__(self, hook=None) -> None:
        super().__init__()
        self.hook = hook
        self.calls: list[tuple[str, str | None]] = []

    def complete(self, *, kind, context=None, **kwargs):
        topic = (context or {}).get("topic")
        self.calls.append((kind, topic))
        if self.hook is not None:
            override = self.hook(self, kind, topic)
            if override is not None:
                return override
        return super().complete(kind=kind, context=context, **kwargs)


def _use(monkeypatch, provider: MockLLMProvider) -> None:
    monkeypatch.setattr(plan_service, "get_llm_provider", lambda *_: provider)


def _generate(client: TestClient, title: str) -> dict:
    goal_id = client.post(
        "/goals", json={"goal_type": "LEARNING", "title": title, "description": ""}
    ).json()["id"]
    md = "# Tema\n\n" + "Contenido de prueba para el plan. " * 200
    files = {"file": (f"{title}.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    response = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]})
    assert response.status_code == 202
    return client.get(f"/plans/{response.json()['id']}").json()


def _latest_plan_id() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.max(Plan.id)))


def _materials(plan_id: int) -> int:
    with SessionLocal() as db:
        return db.scalar(
            select(func.count(SessionMaterial.id))
            .join(StudySession, SessionMaterial.session_id == StudySession.id)
            .where(StudySession.plan_id == plan_id)
        )


def test_a_failed_flush_marks_the_plan_failed_instead_of_processing(client, monkeypatch):
    def broken_persist(self, plan, topics_data):
        self.db.add(PlanTopic(plan_id=plan.id, name=None))
        self.db.flush()

    monkeypatch.setattr(plan_service._Generator, "_persist_topics", broken_persist)

    plan = _generate(client, "Plan flush roto")

    assert plan["status"] == "FAILED"
    assert plan["error_message"] == "No se pudo generar el plan. Inténtalo de nuevo."


def test_ready_plan_reports_content_progress_done_equals_total(client):
    plan = _generate(client, "Plan progreso completo")

    new_sessions = [s for s in plan["sessions"] if s["kind"] == "NEW"]
    assert plan["status"] == "READY"
    assert plan["progress_stage"] == "CONTENT"
    assert plan["progress_done"] == plan["progress_total"] == len(new_sessions) > 0


def test_a_failure_at_session_k_keeps_topics_sessions_and_previous_materials(client, monkeypatch):
    seen: list[str] = []

    def fail_second_session(provider, kind, topic):
        if kind == "session_content":
            if topic not in seen:
                seen.append(topic)
            if len(seen) > 1 and topic == seen[1]:
                raise LLMError("sin espacio", code="LLM_OUTPUT_LIMIT")
        return None

    provider = _Scripted(fail_second_session)
    _use(monkeypatch, provider)

    plan = _generate(client, "Plan fallo en sesión 2")

    assert plan["status"] == "FAILED"
    assert len(plan["sessions"]) >= 2
    assert any(topic["selected"] for topic in plan["topics"])
    assert _materials(plan["id"]) == 1
    assert (plan["progress_stage"], plan["progress_done"]) == ("CONTENT", 1)
    assert plan["progress_total"] == len(plan["sessions"])
    # Both attempts of the second session were made (the second with double the budget).
    assert [call for call in provider.calls if call == ("session_content", seen[1])] == [
        ("session_content", seen[1])
    ] * 2


def test_an_empty_topic_list_fails_the_plan_as_resumable(client, monkeypatch):
    _use(monkeypatch, _Scripted(lambda p, kind, t: '{"topics": []}' if kind == "topic_analysis" else None))

    plan = _generate(client, "Plan sin temas")

    assert plan["status"] == "FAILED"
    assert plan["error_message"] == "La IA no devolvió temas para tu material."
    assert plan["sessions"] == []


def test_progress_is_committed_while_generating(client, monkeypatch):
    observed: list[tuple] = []

    def peek(provider, kind, topic):
        if kind == "session_content" and not observed:
            with SessionLocal() as other:
                plan = other.get(Plan, _latest_plan_id())
                observed.append((plan.progress_stage.value, plan.progress_done, plan.progress_total))
        return None

    _use(monkeypatch, _Scripted(peek))

    plan = _generate(client, "Plan progreso visible")

    assert observed == [("CONTENT", 0, len(plan["sessions"]))]


def test_deleting_the_plan_mid_generation_leaves_no_rows(client, monkeypatch):
    deleted: list[int] = []

    def delete_now(provider, kind, topic):
        if kind == "session_content" and not deleted:
            plan_id = _latest_plan_id()
            with SessionLocal() as other:
                PlanService(other).delete_plan(USER_ID, plan_id)
            deleted.append(plan_id)
        return None

    _use(monkeypatch, _Scripted(delete_now))

    goal_id = client.post(
        "/goals", json={"goal_type": "LEARNING", "title": "Plan borrado", "description": ""}
    ).json()["id"]
    response = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": []})
    assert response.status_code == 202

    [plan_id] = deleted
    assert client.get(f"/plans/{plan_id}").status_code == 404
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(PlanTopic).where(PlanTopic.plan_id == plan_id)) == 0
        assert db.scalar(
            select(func.count()).select_from(StudySession).where(StudySession.plan_id == plan_id)
        ) == 0
        assert db.scalar(
            select(func.count(Quiz.id)).join(StudySession, Quiz.session_id == StudySession.id).where(
                StudySession.plan_id == plan_id
            )
        ) == 0
        orphan_materials = db.scalar(
            select(func.count(SessionMaterial.id)).where(
                SessionMaterial.session_id.not_in(select(StudySession.id))
            )
        )
        orphan_quizzes = db.scalar(
            select(func.count(Quiz.id)).where(Quiz.session_id.not_in(select(StudySession.id)))
        )
        assert orphan_materials == 0
        assert orphan_quizzes == 0


def test_loosely_shaped_topics_still_produce_a_plan(client, monkeypatch):
    loose = (
        '{"topics": ["Tema suelto", {"name": "Tema con texto", "difficulty": "media", '
        '"relevance": "alta", "subtopics": "uno solo"}, {"name": "Tema numérico", '
        '"difficulty": "4", "relevance": "0.9"}, null]}'
    )
    _use(monkeypatch, _Scripted(lambda p, kind, t: loose if kind == "topic_analysis" else None))

    plan = _generate(client, "Plan temas sueltos")

    assert plan["status"] == "READY"
    by_name = {topic["name"]: topic for topic in plan["topics"]}
    assert set(by_name) == {"Tema suelto", "Tema con texto", "Tema numérico"}
    assert (by_name["Tema con texto"]["difficulty"], by_name["Tema con texto"]["relevance"]) == (3, 0.5)
    assert by_name["Tema con texto"]["subtopics"] == ["uno solo"]
    assert (by_name["Tema numérico"]["difficulty"], by_name["Tema numérico"]["relevance"]) == (4, 0.9)


def test_topics_that_are_not_a_list_fail_as_an_invalid_response(client, monkeypatch):
    _use(monkeypatch, _Scripted(lambda p, kind, t: '{"topics": "ninguno"}' if kind == "topic_analysis" else None))

    plan = _generate(client, "Plan temas no lista")

    assert plan["status"] == "FAILED"
    assert plan["error_message"] == "El proveedor de IA devolvió una respuesta inválida."
