"""Dashboard metrics must describe learner progress, not raw QuizResult rows.

- Re-submitting a session's quiz creates another QuizResult, but the session is
  still a single completed session.
- A result without multiple-choice answers has no score (flashcards are rated
  0-5 for SM-2, not graded), so it must not enter the score history or average
  as a 0%.
"""

import io

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def created_plans(client: TestClient):
    """Delete the plans a test creates: the suite shares one database, and other
    modules count every scheduled flashcard review."""
    plan_ids: list[int] = []
    yield plan_ids
    for plan_id in plan_ids:
        assert client.delete(f"/plans/{plan_id}").status_code == 204


def _ready_session(client: TestClient, title: str, created_plans: list[int]) -> int:
    goal_id = client.post(
        "/goals", json={"goal_type": "MEMORIZATION", "title": title, "description": ""}
    ).json()["id"]
    md = "# Tema\n\n" + "Contenido de prueba para el dashboard. " * 200
    files = {"file": (f"{title}.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    plan_id = client.post(
        "/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]}
    ).json()["id"]
    created_plans.append(plan_id)
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "READY"
    return plan["sessions"][0]["id"]


def _answers(quiz: dict, *, include_multiple_choice: bool) -> list[dict]:
    answers = []
    for question in quiz["questions"]:
        if question["question_type"] == "FLASHCARD":
            answers.append({"question_id": question["id"], "quality": 4})
        elif include_multiple_choice:
            answers.append({"question_id": question["id"], "selected_option": question["answer"]})
    return answers


def test_resubmitting_a_session_counts_one_completed_session(
    client: TestClient, created_plans: list[int]
):
    session_id = _ready_session(client, "Reenvío de quiz", created_plans)
    quiz = client.get(f"/quizzes/{session_id}").json()
    before = client.get("/dashboard").json()

    for _ in range(2):
        response = client.post(
            f"/quizzes/{quiz['id']}/submit",
            json={"answers": _answers(quiz, include_multiple_choice=True)},
        )
        assert response.status_code == 200

    after = client.get("/dashboard").json()
    assert after["sessions_completed"] == before["sessions_completed"] + 1


def test_flashcard_only_result_is_not_scored_as_zero(
    client: TestClient, created_plans: list[int]
):
    session_id = _ready_session(client, "Solo flashcards", created_plans)
    quiz = client.get(f"/quizzes/{session_id}").json()
    assert any(q["question_type"] == "FLASHCARD" for q in quiz["questions"])
    before = client.get("/dashboard").json()

    response = client.post(
        f"/quizzes/{quiz['id']}/submit",
        json={"answers": _answers(quiz, include_multiple_choice=False)},
    )
    assert response.status_code == 200
    assert response.json()["total"] == 0

    after = client.get("/dashboard").json()
    assert all(point["session_id"] != session_id for point in after["scores"])
    assert after["weak_topics"] == before["weak_topics"]
    assert after["average_score"] == before["average_score"]
    assert after["sessions_completed"] == before["sessions_completed"] + 1
