"""POST /plans/generate only accepts the caller's own INDEXED documents.

Before this check, a plan could be created (and reach READY with generic
content) from IDs that did not exist, belonged to someone else, or were still
being indexed.
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

import main
from app.db.session import SessionLocal
from app.models.document import Document, DocumentStatus
from app.models.user import User

GENERIC_ERROR = "Selecciona al menos un documento indexado para generar el plan."


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture
def scheduled(monkeypatch) -> list[int]:
    tasks: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", lambda plan_id: tasks.append(plan_id)
    )
    return tasks


def _goal(client: TestClient, title: str) -> int:
    response = client.post("/goals", json={"goal_type": "LEARNING", "title": title, "description": ""})
    assert response.status_code == 201
    return response.json()["id"]


def _indexed_document(client: TestClient, name: str = "apuntes.md") -> int:
    content = "# Tema\n\n" + "Contenido de prueba para indexar. " * 50
    files = {"file": (name, io.BytesIO(content.encode()), "text/markdown")}
    document_id = client.post("/documents/upload", files=files).json()["id"]
    assert client.get(f"/documents/{document_id}").json()["status"] == "INDEXED"
    return document_id


def _stored_document(*, user_id: int, status: DocumentStatus) -> int:
    with SessionLocal() as db:
        if db.get(User, user_id) is None:
            db.add(User(id=user_id, email=f"user{user_id}@example.test"))
            db.flush()
        document = Document(
            user_id=user_id, filename="ajeno.md", file_type="md", file_size=10, status=status
        )
        db.add(document)
        db.commit()
        return document.id


def _plans_for_goal(client: TestClient, goal_id: int) -> list[dict]:
    return [plan for plan in client.get("/plans").json() if plan["goal_id"] == goal_id]


def _assert_rejected(client: TestClient, goal_id: int, document_ids: list[int], scheduled: list[int]):
    response = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": document_ids})
    assert response.status_code == 400
    assert response.json()["code"] == "PLAN_DOCUMENTS_UNAVAILABLE"
    assert _plans_for_goal(client, goal_id) == []
    assert scheduled == []
    return response.json()


def test_rejects_a_document_that_does_not_exist(client: TestClient, scheduled: list[int]):
    goal_id = _goal(client, "Documento inexistente")
    body = _assert_rejected(client, goal_id, [999_999], scheduled)
    assert body["document_ids"] == [999_999]
    assert "999999" in body["detail"]


def test_rejects_another_users_document_without_revealing_it_exists(
    client: TestClient, scheduled: list[int]
):
    goal_id = _goal(client, "Documento ajeno")
    foreign_id = _stored_document(user_id=2, status=DocumentStatus.INDEXED)
    body = _assert_rejected(client, goal_id, [foreign_id], scheduled)
    missing = _assert_rejected(client, goal_id, [999_998], scheduled)
    # Same wording as a missing document: ownership is not disclosed.
    assert body["detail"].replace(str(foreign_id), "X") == missing["detail"].replace("999998", "X")


@pytest.mark.parametrize("status", [DocumentStatus.PENDING, DocumentStatus.FAILED])
def test_rejects_own_documents_that_are_not_indexed(
    client: TestClient, scheduled: list[int], status: DocumentStatus
):
    goal_id = _goal(client, f"Documento {status.value}")
    document_id = _stored_document(user_id=1, status=status)
    body = _assert_rejected(client, goal_id, [document_id], scheduled)
    assert body["document_ids"] == [document_id]


def test_rejects_the_whole_request_when_any_document_is_unavailable(
    client: TestClient, scheduled: list[int]
):
    goal_id = _goal(client, "Mezcla válida e inválida")
    valid_id = _indexed_document(client)
    body = _assert_rejected(client, goal_id, [valid_id, 999_997], scheduled)
    assert body["document_ids"] == [999_997]


def test_rejects_an_empty_document_list(client: TestClient, scheduled: list[int]):
    goal_id = _goal(client, "Sin documentos")
    body = _assert_rejected(client, goal_id, [], scheduled)
    assert body["detail"] == GENERIC_ERROR
    assert body["document_ids"] == []


def test_accepts_indexed_documents_and_stores_each_once(client: TestClient, scheduled: list[int]):
    goal_id = _goal(client, "Documentos válidos")
    first, second = _indexed_document(client, "a.md"), _indexed_document(client, "b.md")

    response = client.post(
        "/plans/generate", json={"goal_id": goal_id, "document_ids": [second, first, second]}
    )

    assert response.status_code == 202
    plan = client.get(f"/plans/{response.json()['id']}").json()
    assert plan["document_ids"] == [second, first]
    assert scheduled == [response.json()["id"]]


def test_idempotent_replay_still_returns_the_accepted_plan_after_its_document_is_deleted(
    client: TestClient, scheduled: list[int]
):
    goal_id = _goal(client, "Replay tras borrar documento")
    document_id = _indexed_document(client)
    payload = {"goal_id": goal_id, "document_ids": [document_id]}
    headers = {"Idempotency-Key": "replay-after-document-delete"}
    first = client.post("/plans/generate", json=payload, headers=headers)
    assert first.status_code == 202
    assert client.delete(f"/documents/{document_id}").status_code == 204

    replay = client.post("/plans/generate", json=payload, headers=headers)

    assert replay.status_code == 202
    assert replay.json()["id"] == first.json()["id"]
    assert scheduled == [first.json()["id"]]


def test_runtime_openapi_documents_the_unavailable_documents_body(client: TestClient):
    operation = client.get("/openapi.json").json()["paths"]["/plans/generate"]["post"]
    schema = operation["responses"]["400"]["content"]["application/json"]["schema"]
    assert schema["required"] == ["detail", "code", "document_ids"]
    assert schema["properties"]["code"]["example"] == "PLAN_DOCUMENTS_UNAVAILABLE"
