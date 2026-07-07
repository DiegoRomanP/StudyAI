"""End-to-end integration test: upload -> plan -> session -> quiz -> dashboard.

Runs against the mock LLM so it is fast and reproducible.
"""

import io

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def test_full_study_flow(client: TestClient):
    # 1. Goal
    r = client.post(
        "/goals",
        json={"goal_type": "MEMORIZATION", "title": "Vocabulario", "description": "Palabras"},
    )
    assert r.status_code == 201
    goal_id = r.json()["id"]

    # 2. Upload a markdown document
    md = ("# Vocabulario\n\n## Sección A\n" + "Concepto importante. " * 200 +
          "\n\n## Sección B\n" + "Otra idea clave. " * 200)
    files = {"file": ("vocab.md", io.BytesIO(md.encode()), "text/markdown")}
    r = client.post("/documents/upload", files=files)
    assert r.status_code == 201
    doc_id = r.json()["id"]
    assert client.get(f"/documents/{doc_id}").json()["status"] == "INDEXED"

    # 3. Generate plan (background task completes within the request via TestClient)
    r = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]})
    assert r.status_code == 202
    plan_id = r.json()["id"]

    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "READY"
    assert plan["sessions"], "expected at least one session"
    session_id = plan["sessions"][0]["id"]

    # 4. Session material
    session = client.get(f"/sessions/{session_id}").json()
    assert session["material"]["content_markdown"]

    # 5. Quiz -> submit
    quiz = client.get(f"/quizzes/{session_id}").json()
    quiz_id = quiz["id"]
    answers = []
    flashcard_ids = []
    for q in quiz["questions"]:
        if q["question_type"] == "MULTIPLE_CHOICE":
            answers.append({"question_id": q["id"], "selected_option": q["answer"]})
        else:
            flashcard_ids.append(q["id"])
            answers.append({"question_id": q["id"], "quality": 5})
    result = client.post(f"/quizzes/{quiz_id}/submit", json={"answers": answers}).json()
    assert result["score"] == 100.0

    # 6. SM-2 scheduled the flashcards for a future review
    dash = client.get("/dashboard").json()
    assert dash["sessions_completed"] >= 1
    total_upcoming = sum(u["count"] for u in dash["upcoming_reviews"])
    assert total_upcoming == len(flashcard_ids)
