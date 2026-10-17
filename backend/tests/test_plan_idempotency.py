"""Public API behavior for idempotent plan generation."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import main
from app.models.plan import Plan


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


def _create_goal(client: TestClient, title: str) -> int:
    response = client.post(
        "/goals",
        json={"goal_type": "LEARNING", "title": title, "description": ""},
    )
    assert response.status_code == 201
    return response.json()["id"]


def _plans_for_goal(client: TestClient, goal_id: int) -> list[dict]:
    response = client.get("/plans")
    assert response.status_code == 200
    return [plan for plan in response.json() if plan["goal_id"] == goal_id]


def test_same_key_and_canonical_payload_replays_one_plan_and_one_task(
    client: TestClient, monkeypatch
):
    goal_id = _create_goal(client, "Replay canónico")
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", lambda plan_id: scheduled.append(plan_id)
    )

    first = client.post(
        "/plans/generate",
        json={"goal_id": goal_id, "document_ids": [9, 4, 9]},
        headers={"Idempotency-Key": "replay-canonical-1"},
    )
    replay = client.post(
        "/plans/generate",
        json={"goal_id": goal_id, "document_ids": [4, 9]},
        headers={"Idempotency-Key": "replay-canonical-1"},
    )

    assert first.status_code == 202
    assert replay.status_code == 202
    assert first.json()["id"] == replay.json()["id"]
    assert first.json()["status"] == replay.json()["status"] == "PROCESSING"
    assert client.get(f"/plans/{first.json()['id']}/status").json() == {
        "id": first.json()["id"],
        "status": "PROCESSING",
        "error_message": "",
    }
    plans = _plans_for_goal(client, goal_id)
    assert len(plans) == 1
    assert scheduled == [first.json()["id"]]


def test_reusing_key_with_different_payload_conflicts_without_side_effects(
    client: TestClient, monkeypatch
):
    goal_id = _create_goal(client, "Payload conflict")
    other_goal_id = _create_goal(client, "Other payload goal")
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", lambda plan_id: scheduled.append(plan_id)
    )
    first = client.post(
        "/plans/generate",
        json={"goal_id": goal_id, "document_ids": [3]},
        headers={"Idempotency-Key": "payload-conflict-1"},
    )
    assert first.status_code == 202

    for different_payload in (
        {"goal_id": goal_id, "document_ids": [8]},
        {"goal_id": other_goal_id, "document_ids": [3]},
    ):
        conflict = client.post(
            "/plans/generate",
            json=different_payload,
            headers={"Idempotency-Key": "payload-conflict-1"},
        )

        assert conflict.status_code == 409
        assert conflict.json() == {
            "detail": "La clave de idempotencia ya se utilizó con una solicitud diferente.",
            "code": "IDEMPOTENCY_KEY_REUSED",
        }
    assert [plan["id"] for plan in _plans_for_goal(client, goal_id)] == [first.json()["id"]]
    assert _plans_for_goal(client, other_goal_id) == []
    assert scheduled == [first.json()["id"]]


def test_distinct_keys_intentionally_create_distinct_plans(client: TestClient, monkeypatch):
    goal_id = _create_goal(client, "Distinct keys")
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", lambda plan_id: scheduled.append(plan_id)
    )

    responses = [
        client.post(
            "/plans/generate",
            json={"goal_id": goal_id, "document_ids": []},
            headers={"Idempotency-Key": key},
        )
        for key in ("distinct-key-a", "distinct-key-b")
    ]

    assert [response.status_code for response in responses] == [202, 202]
    plan_ids = [response.json()["id"] for response in responses]
    assert plan_ids[0] != plan_ids[1]
    assert {plan["id"] for plan in _plans_for_goal(client, goal_id)} == set(plan_ids)
    assert sorted(scheduled) == sorted(plan_ids)


def test_omitting_key_preserves_legacy_new_plan_behavior(client: TestClient, monkeypatch):
    goal_id = _create_goal(client, "Legacy requests")
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", lambda plan_id: scheduled.append(plan_id)
    )

    responses = [
        client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": []})
        for _ in range(2)
    ]

    assert [response.status_code for response in responses] == [202, 202]
    plan_ids = [response.json()["id"] for response in responses]
    assert plan_ids[0] != plan_ids[1]
    assert {plan["id"] for plan in _plans_for_goal(client, goal_id)} == set(plan_ids)
    assert sorted(scheduled) == sorted(plan_ids)


def test_concurrent_same_key_requests_create_one_plan_and_schedule_one_task(
    client: TestClient, monkeypatch
):
    goal_id = _create_goal(client, "Concurrent replay")
    key = "concurrent-replay-1"
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", lambda plan_id: scheduled.append(plan_id)
    )
    before_commit = Barrier(2)

    def synchronize_competing_insertions(session: Session) -> None:
        if any(
            isinstance(plan, Plan) and getattr(plan, "idempotency_key", None) == key
            for plan in session.new
        ):
            before_commit.wait(timeout=10)

    event.listen(Session, "before_commit", synchronize_competing_insertions)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(
                    client.post,
                    "/plans/generate",
                    json={"goal_id": goal_id, "document_ids": [2, 5]},
                    headers={"Idempotency-Key": key},
                )
                for _ in range(2)
            ]
            responses = [future.result(timeout=20) for future in futures]
    finally:
        event.remove(Session, "before_commit", synchronize_competing_insertions)

    assert [response.status_code for response in responses] == [202, 202]
    plan_ids = [response.json()["id"] for response in responses]
    assert plan_ids[0] == plan_ids[1]
    assert [plan["id"] for plan in _plans_for_goal(client, goal_id)] == [plan_ids[0]]
    assert scheduled == [plan_ids[0]]


def test_legacy_plans_receive_idempotency_columns_and_database_unique_index(
    monkeypatch, tmp_path
):
    from app.db import init_db

    legacy_engine = create_engine(f"sqlite:///{tmp_path / 'legacy_plans.db'}")
    with legacy_engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE plans (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL)")
        )

    monkeypatch.setattr(init_db, "engine", legacy_engine)
    init_db._ensure_plan_idempotency_columns()
    init_db._ensure_plan_idempotency_columns()

    columns = {column["name"] for column in inspect(legacy_engine).get_columns("plans")}
    assert {"idempotency_key", "idempotency_request_hash"}.issubset(columns)
    with legacy_engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO plans (id, user_id, idempotency_key, idempotency_request_hash) "
                "VALUES (1, 1, 'db-enforced', 'first')"
            )
        )
    with pytest.raises(IntegrityError):
        with legacy_engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO plans (id, user_id, idempotency_key, idempotency_request_hash) "
                    "VALUES (2, 1, 'db-enforced', 'second')"
                )
            )
    with legacy_engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO plans (id, user_id, idempotency_key, idempotency_request_hash) "
                "VALUES (3, 2, 'db-enforced', 'other-user')"
            )
        )
    legacy_engine.dispose()


def test_runtime_openapi_documents_idempotency_conflict_body(client: TestClient):
    operation = client.get("/openapi.json").json()["paths"]["/plans/generate"]["post"]
    schema = operation["responses"]["409"]["content"]["application/json"]["schema"]

    assert schema == {
        "type": "object",
        "required": ["detail", "code"],
        "properties": {
            "detail": {"type": "string"},
            "code": {"type": "string", "example": "IDEMPOTENCY_KEY_REUSED"},
        },
    }
