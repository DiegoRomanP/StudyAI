"""Study assistant: grounded answers while reading, hints only during the test."""

from __future__ import annotations

import dataclasses
import io

import pytest
from fastapi.testclient import TestClient

import main
from app.core.config import Settings
from app.db.session import SessionLocal
from app.llm.factory import resolve_llm_provider
from app.llm.mock_provider import MockLLMProvider
from app.models.assistant_message import AssistantMessage
from app.models.free_ai_usage import FreeAiUsage
from app.services import assistant_service, free_ai_quota


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def plan(client: TestClient):
    goal_id = client.post("/goals", json={"goal_type": "EXAM", "title": "Asistente", "description": ""}).json()["id"]
    md = "# Fotosíntesis\n\n" + "La clorofila capta la luz para producir glucosa. " * 120
    files = {"file": ("asistente.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    plan_id = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]}).json()["id"]
    yield client.get(f"/plans/{plan_id}").json()
    client.delete(f"/plans/{plan_id}")


class _Spy(MockLLMProvider):
    def __init__(self) -> None:
        super().__init__()
        self.prompts: list[str] = []

    def complete(self, **kwargs):
        self.prompts.append(kwargs["prompt"])
        return super().complete(**kwargs)


def _use(monkeypatch, provider: MockLLMProvider, *, bundled: bool = False) -> None:
    def resolve(db, user_id):
        real = resolve_llm_provider(db, user_id)
        real.provider.close()
        return dataclasses.replace(real, provider=provider, runtime=dataclasses.replace(real.runtime, bundled=bundled))

    monkeypatch.setattr(assistant_service, "resolve_llm_provider", resolve)


def test_study_question_is_answered_and_saved_with_its_reply(client, plan):
    session_id = plan["sessions"][0]["id"]

    response = client.post(f"/sessions/{session_id}/assistant", json={"message": "¿Qué es la clorofila?"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["question"]["content"] == "¿Qué es la clorofila?"
    assert body["answer"]["role"] == "ASSISTANT" and body["answer"]["content"]
    assert body["remaining"] is None  # the mock never spends free uses
    history = client.get(f"/sessions/{session_id}/assistant").json()
    assert [m["role"] for m in history["messages"]] == ["USER", "ASSISTANT"]
    [item] = client.get("/assistant/questions", params={"plan_id": plan["id"]}).json()
    assert (item["question"], item["session_id"]) == ("¿Qué es la clorofila?", session_id)
    assert item["answer"] == body["answer"]["content"]


def test_exam_prompt_shows_the_question_but_never_its_answer(client, plan, monkeypatch):
    spy = _Spy()
    _use(monkeypatch, spy)
    session_id = plan["sessions"][0]["id"]
    quiz = client.get(f"/quizzes/{session_id}").json()
    question = next(q for q in quiz["questions"] if q["question_type"] == "MULTIPLE_CHOICE")

    response = client.post(
        f"/sessions/{session_id}/assistant",
        json={"message": "Dime la respuesta", "mode": "EXAM", "question_id": str(question["id"])},
    )

    assert response.status_code == 200, response.text
    [prompt] = spy.prompts
    assert question["prompt"] in prompt
    assert "NUNCA des la respuesta" in prompt
    assert f"Respuesta correcta: {question['answer']}" not in prompt
    assert response.json()["answer"]["mode"] == "EXAM"


def test_free_ai_messages_have_their_own_daily_limit(client, plan, monkeypatch):
    settings = Settings(FREE_AI_ASSISTANT_DAILY_LIMIT=1)
    monkeypatch.setattr(free_ai_quota, "get_settings", lambda: settings)
    _use(monkeypatch, MockLLMProvider(), bundled=True)
    session_id = plan["sessions"][0]["id"]
    with SessionLocal() as db:
        db.query(FreeAiUsage).delete()
        db.commit()

    first = client.post(f"/sessions/{session_id}/assistant", json={"message": "Primera duda"})
    refused = client.post(f"/sessions/{session_id}/assistant", json={"message": "Segunda duda"})

    assert first.status_code == 200 and first.json()["remaining"] == 0
    assert refused.status_code == 429 and refused.json()["code"] == "FREE_AI_ASSISTANT_LIMIT"
    with SessionLocal() as db:
        row = db.query(FreeAiUsage).one()
        assert (row.uses, row.assistant_uses) == (0, 1)  # plan uses untouched
        assert db.query(AssistantMessage).filter(AssistantMessage.content == "Segunda duda").count() == 0


def test_failed_call_refunds_the_message_and_saves_nothing(client, plan, monkeypatch):
    class _Broken(MockLLMProvider):
        def complete(self, **kwargs):
            from app.core.exceptions import LLMError
            raise LLMError("Proveedor caído.", code="LLM_PROVIDER_ERROR")

    settings = Settings(FREE_AI_ASSISTANT_DAILY_LIMIT=5)
    monkeypatch.setattr(free_ai_quota, "get_settings", lambda: settings)
    _use(monkeypatch, _Broken(), bundled=True)
    with SessionLocal() as db:
        db.query(FreeAiUsage).delete()
        db.commit()

    response = client.post(f"/sessions/{plan['sessions'][0]['id']}/assistant", json={"message": "¿Hola?"})

    assert response.status_code >= 400
    with SessionLocal() as db:
        assert sum(row.assistant_uses for row in db.query(FreeAiUsage).all()) == 0
        assert db.query(AssistantMessage).filter(AssistantMessage.plan_id == plan["id"]).count() == 0


def test_unknown_session_and_plan_deletion(client, plan):
    session_id = plan["sessions"][0]["id"]
    assert client.post("/sessions/999999/assistant", json={"message": "Hola"}).status_code == 404
    assert client.post(f"/sessions/{session_id}/assistant", json={"message": ""}).status_code == 422
    client.post(f"/sessions/{session_id}/assistant", json={"message": "Antes de borrar"})

    assert client.delete(f"/plans/{plan['id']}").status_code == 204

    with SessionLocal() as db:
        assert db.query(AssistantMessage).filter(AssistantMessage.plan_id == plan["id"]).count() == 0
