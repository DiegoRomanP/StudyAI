"""The plan's session list and GET /sessions/{id}/result expose the latest test result."""

import io

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def _ready_plan(client: TestClient) -> dict:
    goal_id = client.post(
        "/goals", json={"goal_type": "EXAM", "title": "Resultados", "description": ""}
    ).json()["id"]
    md = "# Tema\n\n" + "Contenido de prueba para el plan. " * 200
    files = {"file": ("resultados.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    plan_id = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]}).json()["id"]
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "READY"
    return plan


def _answers(quiz: dict, wrong: int = 0, include_mc: bool = True) -> list[dict]:
    """Rates every flashcard and answers the multiple choice, the first `wrong` ones badly."""
    answers = []
    for question in quiz["questions"]:
        if question["question_type"] == "FLASHCARD":
            answers.append({"question_id": question["id"], "quality": 4})
        elif include_mc:
            if wrong > 0:
                selected = next(option for option in question["options"] if option.strip() != question["answer"].strip())
                wrong -= 1
            else:
                selected = question["answer"]
            answers.append({"question_id": question["id"], "selected_option": selected})
    return answers


def _summary(client: TestClient, plan_id: int, session_id: int) -> dict:
    plan = client.get(f"/plans/{plan_id}").json()
    return next(item for item in plan["sessions"] if item["id"] == session_id)


def test_last_result_follows_the_latest_attempt(client: TestClient):
    plan = _ready_plan(client)
    session_id = plan["sessions"][0]["id"]
    assert _summary(client, plan["id"], session_id)["last_result"] is None
    assert client.get(f"/sessions/{session_id}/result").status_code == 404

    quiz = client.get(f"/quizzes/{session_id}").json()
    mc_total = sum(1 for q in quiz["questions"] if q["question_type"] == "MULTIPLE_CHOICE")
    assert mc_total >= 2

    first = client.post(f"/quizzes/{quiz['id']}/submit", json={"answers": _answers(quiz, wrong=1)})
    assert first.status_code == 200
    last = _summary(client, plan["id"], session_id)["last_result"]
    assert last["correct"] == mc_total - 1
    assert last["total"] == mc_total
    assert last["score"] == first.json()["score"]
    assert last["created_at"]

    second = client.post(f"/quizzes/{quiz['id']}/submit", json={"answers": _answers(quiz)}).json()
    last = _summary(client, plan["id"], session_id)["last_result"]
    assert (last["correct"], last["total"], last["score"]) == (mc_total, mc_total, 100.0)

    result = client.get(f"/sessions/{session_id}/result")
    assert result.status_code == 200
    assert result.json() == second


def test_flashcard_only_attempt_has_no_graded_questions(client: TestClient):
    plan = _ready_plan(client)
    session_id = plan["sessions"][0]["id"]
    quiz = client.get(f"/quizzes/{session_id}").json()

    client.post(f"/quizzes/{quiz['id']}/submit", json={"answers": _answers(quiz, include_mc=False)})
    last = _summary(client, plan["id"], session_id)["last_result"]
    assert (last["correct"], last["total"]) == (0, 0)


def test_result_of_a_missing_session_is_404(client: TestClient):
    assert client.get("/sessions/999999/result").status_code == 404
