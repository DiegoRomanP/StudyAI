"""Regression tests for the request-volume reductions in the plan-generation
pipeline: merging the per-session content+quiz calls into one (halving the
per-session LLM call count) and honoring the goal strategy's exact
flashcard/multiple-choice counts instead of asking for a fixed 5+5 and
truncating the result afterwards.
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

import main
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
