"""Deleting a plan must remove it (and its sessions/quizzes) and must not
leave orphaned FlashcardReview rows behind — those aren't covered by the
Plan -> Session -> Quiz -> QuizQuestion ORM cascade (see PlanService.delete_plan).
"""

import io

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def _build_ready_plan(client: TestClient, title: str) -> tuple[int, int]:
    """Create a goal + indexed document + READY plan; returns (plan_id, session_id)."""
    goal_id = client.post(
        "/goals", json={"goal_type": "MEMORIZATION", "title": title, "description": ""}
    ).json()["id"]

    md = "# Tema\n\n" + "Contenido de prueba para el plan. " * 200
    files = {"file": (f"{title}.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    assert client.get(f"/documents/{doc_id}").json()["status"] == "INDEXED"

    r = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]})
    plan_id = r.json()["id"]
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "READY"
    return plan_id, plan["sessions"][0]["id"]


def test_delete_plan_removes_it_and_cleans_up_flashcard_reviews(client: TestClient):
    plan_id, session_id = _build_ready_plan(client, "Plan con flashcards")

    quiz = client.get(f"/quizzes/{session_id}").json()
    quiz_id = quiz["id"]
    answers = []
    flashcard_count = 0
    for q in quiz["questions"]:
        if q["question_type"] == "FLASHCARD":
            flashcard_count += 1
            answers.append({"question_id": q["id"], "quality": 5})
        else:
            answers.append({"question_id": q["id"], "selected_option": q["answer"]})
    client.post(f"/quizzes/{quiz_id}/submit", json={"answers": answers})
    assert flashcard_count > 0, "mock LLM should always produce at least one flashcard"

    before = client.get("/dashboard").json()
    assert sum(u["count"] for u in before["upcoming_reviews"]) >= flashcard_count

    r = client.delete(f"/plans/{plan_id}")
    assert r.status_code == 204

    assert client.get(f"/plans/{plan_id}").status_code == 404
    assert plan_id not in [p["id"] for p in client.get("/plans").json()]
    assert client.get(f"/sessions/{session_id}").status_code == 404

    after = client.get("/dashboard").json()
    after_total = sum(u["count"] for u in after["upcoming_reviews"])
    before_total = sum(u["count"] for u in before["upcoming_reviews"])
    assert after_total == before_total - flashcard_count


def test_delete_plan_twice_returns_404_the_second_time(client: TestClient):
    plan_id, _ = _build_ready_plan(client, "Plan doble borrado")

    assert client.delete(f"/plans/{plan_id}").status_code == 204
    assert client.delete(f"/plans/{plan_id}").status_code == 404


def test_delete_nonexistent_plan_returns_404(client: TestClient):
    r = client.delete("/plans/999999")
    assert r.status_code == 404
