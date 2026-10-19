"""Plans and sessions expose the adaptive-route fields with safe defaults."""

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
        "/goals", json={"goal_type": "EXAM", "title": "Campos adaptativos", "description": ""}
    ).json()["id"]
    md = "# Tema\n\n" + "Contenido de prueba para el plan. " * 200
    files = {"file": ("adaptativo.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    plan_id = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]}).json()["id"]
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "READY"
    return plan


def test_plan_and_session_expose_adaptive_fields_with_defaults(client: TestClient):
    plan = _ready_plan(client)

    for topic in plan["topics"]:
        assert topic["mastery"] is None
        assert topic["review_box"] == 0
        assert topic["mastery_state"] == "SIN_DATOS"
        assert topic["priority"] == round(topic["relevance"] * 0.5, 4)
    summary = plan["sessions"][0]
    assert summary["kind"] == "NEW"
    assert summary["scheduled_date"] is None or isinstance(summary["scheduled_date"], str)
    assert summary["reinforcement_status"] == "NONE"

    detail = client.get(f"/sessions/{summary['id']}").json()
    assert detail["kind"] == "NEW"
    assert detail["review_points"] == []
    assert detail["reinforcement_status"] == "NONE"
    assert detail["reinforcement_error"] == ""
