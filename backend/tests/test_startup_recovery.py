"""A restart leaves no plan or reinforcement in PROCESSING forever."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import update

import main
from app.db.session import SessionLocal
from app.models.session import ReinforcementStatus
from app.models.session import Session as StudySession
from app.services.free_ai_quota import FreeAiQuota
from tests.test_default_free_provider import _free_ai_client, _goal, _reset_usage
from tests.test_free_ai_refund import _uses

USER_ID = 1
INTERRUPTED = (
    "La generación se interrumpió porque el servidor se reinició. "
    "Pulsa «Continuar generación» para terminarla."
)


def test_a_plan_left_processing_is_failed_and_refunded_on_startup(monkeypatch):
    with _free_ai_client(monkeypatch) as client:
        _reset_usage()
        client.post("/llm-settings/deactivate-all")
        plan_id = client.post("/plans/generate", json={"goal_id": _goal(client), "document_ids": []}).json()["id"]
        assert client.get(f"/plans/{plan_id}/status").json()["status"] == "PROCESSING"
        assert _uses() == 1

    with TestClient(main.app) as restarted:
        status = restarted.get(f"/plans/{plan_id}/status").json()

    assert (status["status"], status["error_message"]) == ("FAILED", INTERRUPTED)
    assert _uses() == 0


def test_startup_recovery_is_idempotent(monkeypatch):
    with _free_ai_client(monkeypatch) as client:
        _reset_usage()
        client.post("/llm-settings/deactivate-all")
        plan_id = client.post("/plans/generate", json={"goal_id": _goal(client), "document_ids": []}).json()["id"]

    with TestClient(main.app):
        pass
    assert _uses() == 0
    with SessionLocal() as db:
        FreeAiQuota(db).consume(USER_ID)  # a later, unrelated use

    with TestClient(main.app) as restarted:
        assert restarted.get(f"/plans/{plan_id}/status").json()["status"] == "FAILED"

    assert _uses() == 1


def test_a_reinforcement_left_processing_is_failed_on_startup():
    with TestClient(main.app) as client:
        goal_id = client.post(
            "/goals", json={"goal_type": "LEARNING", "title": "Refuerzo cortado", "description": ""}
        ).json()["id"]
        plan_id = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": []}).json()["id"]
        session_id = client.get(f"/plans/{plan_id}").json()["sessions"][0]["id"]
        with SessionLocal() as db:
            db.execute(
                update(StudySession)
                .where(StudySession.id == session_id)
                .values(reinforcement_status=ReinforcementStatus.PROCESSING)
            )
            db.commit()

    with TestClient(main.app) as restarted:
        detail = restarted.get(f"/sessions/{session_id}").json()

    assert detail["reinforcement_status"] == "FAILED"
    assert detail["reinforcement_error"] == (
        "El refuerzo se interrumpió porque el servidor se reinició. Inténtalo de nuevo."
    )
