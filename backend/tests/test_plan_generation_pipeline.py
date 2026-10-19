"""Regression tests for the request-volume reductions in the plan-generation
pipeline: merging the per-session content+quiz calls into one (halving the
per-session LLM call count) and honoring the goal strategy's exact
flashcard/multiple-choice counts instead of asking for a fixed 5+5 and
truncating the result afterwards.
"""

from __future__ import annotations

import io
import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

import main
from app.core.exceptions import LLMError
from app.llm.mock_provider import MockLLMProvider


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def _build_ready_plan(client: TestClient, goal_type: str, title: str) -> dict:
    goal_id = client.post(
        "/goals", json={"goal_type": goal_type, "title": title, "description": ""}
    ).json()["id"]

    md = "# Tema\n\n" + "Contenido de prueba para el plan. " * 200
    files = {"file": (f"{title}.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    assert client.get(f"/documents/{doc_id}").json()["status"] == "INDEXED"

    r = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]})
    plan = client.get(f"/plans/{r.json()['id']}").json()
    assert plan["status"] == "READY"
    return plan


def test_memorization_plan_gets_exact_strategy_flashcard_and_mc_counts(client: TestClient):
    # Regression: the old two-call design always asked for a fixed 5
    # flashcards + 5 multiple-choice, then truncated the result down to
    # whatever the strategy wanted — so MEMORIZATION (8 flashcards, 2 MC)
    # only ever got 5 flashcards, never the 8 it was supposed to have.
    plan = _build_ready_plan(client, "MEMORIZATION", "Plan memorizacion conteo")
    session_id = plan["sessions"][0]["id"]
    quiz = client.get(f"/quizzes/{session_id}").json()

    flashcards = [q for q in quiz["questions"] if q["question_type"] == "FLASHCARD"]
    multiple_choice = [q for q in quiz["questions"] if q["question_type"] == "MULTIPLE_CHOICE"]
    assert len(flashcards) == 8
    assert len(multiple_choice) == 2


def test_exam_plan_gets_exact_strategy_flashcard_and_mc_counts(client: TestClient):
    plan = _build_ready_plan(client, "EXAM", "Plan examen conteo")
    session_id = plan["sessions"][0]["id"]
    quiz = client.get(f"/quizzes/{session_id}").json()

    flashcards = [q for q in quiz["questions"] if q["question_type"] == "FLASHCARD"]
    multiple_choice = [q for q in quiz["questions"] if q["question_type"] == "MULTIPLE_CHOICE"]
    assert len(flashcards) == 3
    assert len(multiple_choice) == 7


def test_plan_generation_makes_two_plus_one_per_session_llm_calls(client: TestClient, monkeypatch):
    # Regression: this used to be 2 + 2*sessions (a separate content call and
    # quiz call per session) — halved by merging them into one call per
    # session. Counting real LLM calls (not retries) pins the call budget.
    call_count = 0
    original_complete = MockLLMProvider.complete

    def counting_complete(self, **kwargs):
        nonlocal call_count
        call_count += 1
        return original_complete(self, **kwargs)

    monkeypatch.setattr(MockLLMProvider, "complete", counting_complete)

    plan = _build_ready_plan(client, "LEARNING", "Plan conteo de llamadas")
    num_sessions = len(plan["sessions"])
    assert num_sessions > 0
    assert call_count == 2 + num_sessions


def test_mock_provider_pacing_is_skipped_so_generation_stays_fast(client: TestClient, monkeypatch):
    # LLM_REQUEST_PACING_SECONDS must never slow down the mock provider path
    # (local dev / the whole test suite runs on it) — only real providers.
    sleep_calls: list[float] = []
    monkeypatch.setattr("app.services.plan_service.time.sleep", lambda s: sleep_calls.append(s))

    _build_ready_plan(client, "LEARNING", "Plan sin pacing")
    assert sleep_calls == []


def test_plan_failure_persists_and_logs_only_the_safe_llm_message(client: TestClient, monkeypatch, caplog):
    class FailingProvider:
        requires_request_pacing = False

        def complete(self, **_kwargs):
            try:
                raise RuntimeError("upstream body leaked-key-123")
            except RuntimeError as cause:
                raise LLMError(
                    "El proveedor de IA rechazó el acceso al modelo.",
                    code="LLM_ACCESS_DENIED",
                    provider="NVIDIA",
                    upstream_status=403,
                ) from cause

        def close(self):
            pass

    monkeypatch.setattr("app.services.plan_service.get_llm_provider", lambda *_: FailingProvider())

    goal_id = client.post(
        "/goals", json={"goal_type": "LEARNING", "title": "Plan seguro", "description": ""}
    ).json()["id"]
    document_id = client.post(
        "/documents/upload",
        files={"file": ("seguro.md", io.BytesIO(b"# Tema\nContenido"), "text/markdown")},
    ).json()["id"]
    response = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [document_id]})
    plan = client.get(f"/plans/{response.json()['id']}").json()

    assert plan["status"] == "FAILED"
    assert plan["error_message"] == "El proveedor de IA rechazó el acceso al modelo."
    assert "leaked-key-123" not in caplog.text
    assert "code=LLM_ACCESS_DENIED, upstream_status=403" in caplog.text


def test_session_plan_provider_failure_does_not_continue_with_session_content(client: TestClient, monkeypatch):
    class FailingSessionPlanProvider(MockLLMProvider):
        calls: list[str] = []

        def complete(self, *, kind, **kwargs):
            self.calls.append(kind)
            if kind == "session_plan":
                raise LLMError(
                    "La cuota o el saldo del proveedor de IA se agotó.",
                    code="LLM_QUOTA_EXHAUSTED",
                    provider="OPENAI",
                )
            return super().complete(kind=kind, **kwargs)

    provider = FailingSessionPlanProvider()
    monkeypatch.setattr("app.services.plan_service.get_llm_provider", lambda *_: provider)

    goal_id = client.post(
        "/goals", json={"goal_type": "LEARNING", "title": "Plan sin cuota", "description": ""}
    ).json()["id"]
    document_id = client.post(
        "/documents/upload",
        files={"file": ("cuota.md", io.BytesIO(b"# Tema\nContenido"), "text/markdown")},
    ).json()["id"]
    response = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [document_id]})
    plan = client.get(f"/plans/{response.json()['id']}").json()

    assert plan["status"] == "FAILED"
    assert provider.calls == ["topic_analysis", "session_plan"]


@respx.mock
def test_adapter_failure_reaches_plan_storage_and_api_without_exposing_response_body(client: TestClient, monkeypatch):
    from app.llm.openai_compatible_provider import OpenAICompatibleProvider
    from app.llm.request_profiles import STANDARD_CHAT_PROFILE

    secret = "secret-upstream-document-content"
    provider = OpenAICompatibleProvider(
        base_url="https://api.example.test/v1",
        api_key="test-key",
        model="test-model",
        request_profile=STANDARD_CHAT_PROFILE,
        max_retries=1,
    )
    monkeypatch.setattr("app.services.plan_service.get_llm_provider", lambda *_: provider)
    respx.post("https://api.example.test/v1/chat/completions").mock(
        return_value=httpx.Response(403, json={"error": {"message": secret}})
    )

    goal_id = client.post(
        "/goals", json={"goal_type": "LEARNING", "title": "Plan fallo adaptador", "description": ""}
    ).json()["id"]
    document_id = client.post(
        "/documents/upload",
        files={"file": ("fallo.md", io.BytesIO(b"# Tema\nContenido"), "text/markdown")},
    ).json()["id"]
    response = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [document_id]})
    plan_response = client.get(f"/plans/{response.json()['id']}")

    assert plan_response.status_code == 200
    assert plan_response.json()["error_message"] == "El proveedor de IA rechazó el acceso al modelo. Revisa permisos y disponibilidad."
    assert secret not in plan_response.text


@respx.mock
def test_truncated_llm_output_fails_generation_before_json_parsing(client: TestClient, monkeypatch):
    from app.llm.openai_compatible_provider import OpenAICompatibleProvider
    from app.llm.request_profiles import STANDARD_CHAT_PROFILE

    provider = OpenAICompatibleProvider(
        base_url="https://api.example.test/v1",
        api_key="test-key",
        model="test-model",
        request_profile=STANDARD_CHAT_PROFILE,
        max_retries=1,
    )
    monkeypatch.setattr("app.services.plan_service.get_llm_provider", lambda *_: provider)
    route = respx.post("https://api.example.test/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "length",
                        "message": {"content": '{"topics": ['},
                    }
                ]
            },
        )
    )

    goal_id = client.post(
        "/goals", json={"goal_type": "LEARNING", "title": "Plan truncado", "description": ""}
    ).json()["id"]
    document_id = client.post(
        "/documents/upload",
        files={"file": ("truncado.md", io.BytesIO(b"# Tema\nContenido"), "text/markdown")},
    ).json()["id"]
    response = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [document_id]})
    plan = client.get(f"/plans/{response.json()['id']}").json()

    assert plan["status"] == "FAILED"
    assert plan["error_message"] == "El proveedor de IA agotó el presupuesto de salida antes de completar la respuesta."
    assert route.call_count == 1


def test_new_plan_sessions_link_once_to_each_selected_topic(client: TestClient):
    plan = _build_ready_plan(client, "LEARNING", "Plan enlace de temas")

    selected_ids = sorted(t["id"] for t in plan["topics"] if t["selected"])
    assert sorted(s["topic_id"] for s in plan["sessions"]) == selected_ids
    assert {s["kind"] for s in plan["sessions"]} == {"NEW"}
    assert all(s["scheduled_date"] for s in plan["sessions"])
    dates = [s["scheduled_date"] for s in sorted(plan["sessions"], key=lambda s: s["order_index"])]
    assert dates == sorted(dates)


def test_session_plan_names_are_normalized_deduped_and_missing_topics_appended(
    client: TestClient, monkeypatch
):
    class ScriptedPlanProvider(MockLLMProvider):
        calls = 0

        def complete(self, *, kind, context=None, **kwargs):
            type(self).calls += 1
            if kind == "session_plan":
                first = (context or {})["topics"][0]
                return json.dumps(
                    {
                        "sessions": [
                            {"topic_name": f"  {first.upper()} ", "review_offset_days": 3},
                            {"topic_name": first, "review_offset_days": 7},  # duplicate
                            {"topic_name": "Tema inventado", "review_offset_days": 1},
                            "not-a-dict",
                        ]
                    }
                )
            return super().complete(kind=kind, context=context, **kwargs)

    monkeypatch.setattr("app.services.plan_service.get_llm_provider", lambda *_: ScriptedPlanProvider())
    plan = _build_ready_plan(client, "LEARNING", "Plan nombres normalizados")

    selected = [t for t in plan["topics"] if t["selected"]]
    sessions = sorted(plan["sessions"], key=lambda s: s["order_index"])
    assert [s["topic_id"] for s in sessions][0] == selected[0]["id"]
    assert sessions[0]["topic_name"] == selected[0]["name"]
    assert sessions[0]["review_offset_days"] == 3
    assert sorted(s["topic_id"] for s in sessions) == sorted(t["id"] for t in selected)
    assert "Tema inventado" not in [s["topic_name"] for s in sessions]
    assert ScriptedPlanProvider.calls == 2 + len(sessions)
