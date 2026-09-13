"""Goal CRUD: create/update already existed; this covers edit + delete +
the cascade-to-plans behavior that comes with allowing deletion.
"""

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


def test_delete_goal_cascades_to_its_plans(client: TestClient):
    goal_id = _create_goal(client, "Meta con plan")

    md = "# Tema\n\n" + "Contenido de prueba. " * 200
    files = {"file": ("notes.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    assert client.get(f"/documents/{doc_id}").json()["status"] == "INDEXED"

    r = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]})
    assert r.status_code == 202
    plan_id = r.json()["id"]
    assert client.get(f"/plans/{plan_id}").json()["status"] == "READY"

    assert client.delete(f"/goals/{goal_id}").status_code == 204

    assert client.get(f"/goals/{goal_id}").status_code == 404
    assert client.get(f"/plans/{plan_id}").status_code == 404
    assert plan_id not in [p["id"] for p in client.get("/plans").json()]
