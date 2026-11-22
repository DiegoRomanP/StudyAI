"""Goal CRUD: edit + delete. Deleting a goal hides it but keeps its plans and progress."""

import io

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def _create_goal(client: TestClient, title: str = "Meta original") -> int:
    r = client.post(
        "/goals",
        json={"goal_type": "LEARNING", "title": title, "description": "desc"},
    )
    assert r.status_code == 201
    return r.json()["id"]


def test_update_goal_changes_fields(client: TestClient):
    goal_id = _create_goal(client)

    r = client.put(
        f"/goals/{goal_id}",
        json={"goal_type": "EXAM", "title": "Meta editada", "description": "nueva desc"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Meta editada"
    assert body["description"] == "nueva desc"
    assert body["goal_type"] == "EXAM"


def test_update_goal_partial_only_changes_provided_fields(client: TestClient):
    goal_id = _create_goal(client, "Meta parcial")

    r = client.put(f"/goals/{goal_id}", json={"title": "Solo título cambiado"})
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Solo título cambiado"
    assert body["description"] == "desc"  # untouched
    assert body["goal_type"] == "LEARNING"  # untouched


def test_update_nonexistent_goal_returns_404(client: TestClient):
    r = client.put("/goals/999999", json={"title": "x"})
    assert r.status_code == 404


def test_delete_goal_removes_it(client: TestClient):
    goal_id = _create_goal(client, "Meta a borrar")

    r = client.delete(f"/goals/{goal_id}")
    assert r.status_code == 204
    assert client.get(f"/goals/{goal_id}").status_code == 404
    assert goal_id not in [g["id"] for g in client.get("/goals").json()]


def test_delete_goal_twice_returns_404_the_second_time(client: TestClient):
    goal_id = _create_goal(client, "Meta doble borrado")

    assert client.delete(f"/goals/{goal_id}").status_code == 204
    assert client.delete(f"/goals/{goal_id}").status_code == 404


def test_delete_nonexistent_goal_returns_404(client: TestClient):
    r = client.delete("/goals/999999")
    assert r.status_code == 404


def test_delete_goal_keeps_its_plans_sessions_and_results(client: TestClient):
    goal_id = _create_goal(client, "Meta con plan")

    md = "# Tema\n\n" + "Contenido de prueba. " * 200
    files = {"file": ("notes.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    assert client.get(f"/documents/{doc_id}").json()["status"] == "INDEXED"

    r = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]})
    assert r.status_code == 202
    plan_id = r.json()["id"]
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "READY"
    session_id = plan["sessions"][0]["id"]
    quiz = client.get(f"/quizzes/{session_id}").json()
    answers = [
        {"question_id": q["id"], "quality": 5}
        if q["question_type"] == "FLASHCARD"
        else {"question_id": q["id"], "selected_option": q["answer"]}
        for q in quiz["questions"]
    ]
    assert client.post(f"/quizzes/{quiz['id']}/submit", json={"answers": answers}).status_code == 200

    assert client.delete(f"/goals/{goal_id}").status_code == 204

    assert client.get(f"/goals/{goal_id}").status_code == 404
    assert goal_id not in [g["id"] for g in client.get("/goals").json()]
    kept = client.get(f"/plans/{plan_id}")
    assert kept.status_code == 200
    assert [s["id"] for s in kept.json()["sessions"]] == [s["id"] for s in plan["sessions"]]
    assert plan_id in [p["id"] for p in client.get("/plans").json()]
    assert client.get(f"/sessions/{session_id}/result").status_code == 200
    # A deleted goal takes no new plans.
    r = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]})
    assert r.status_code == 404
    # The plan is still removable on its own (and its reviews leave the shared test DB clean).
    assert client.delete(f"/plans/{plan_id}").status_code == 204


def test_goal_exam_date_create_update_clear_and_omit(client: TestClient):
    r = client.post("/goals", json={"title": "Con examen", "exam_date": "2030-05-20"})
    assert r.status_code == 201
    goal_id = r.json()["id"]
    assert r.json()["exam_date"] == "2030-05-20"

    r = client.put(f"/goals/{goal_id}", json={"exam_date": "2030-06-01"})
    assert r.json()["exam_date"] == "2030-06-01"

    r = client.put(f"/goals/{goal_id}", json={"title": "Otro título"})  # omitted: unchanged
    assert r.json()["exam_date"] == "2030-06-01"

    r = client.put(f"/goals/{goal_id}", json={"exam_date": None})  # explicit null clears
    assert r.json()["exam_date"] is None
