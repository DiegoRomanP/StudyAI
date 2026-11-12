"""Request and persistence compatibility for v2 academic profile hints."""

from __future__ import annotations

from datetime import datetime, timezone
from tempfile import TemporaryDirectory

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text

from app.models.plan import Plan
from tests.helpers import indexed_doc
from app.schemas.plan import PlanGenerateRequest, PlanResponse


PROFILE_HINTS = (
    "logical_deductive",
    "critical_argumentative",
    "linguistic_interpretive",
    "systemic_empirical",
    "applied_practical",
    "auto",
)


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as test_client:
        yield test_client


def _create_goal(client, title: str) -> int:
    response = client.post(
        "/goals", json={"goal_type": "LEARNING", "title": title, "description": ""}
    )
    assert response.status_code == 201
    return response.json()["id"]


def _plans_for_goal(client, goal_id: int) -> list[dict]:
    response = client.get("/plans")
    assert response.status_code == 200
    return [plan for plan in response.json() if plan["goal_id"] == goal_id]


@pytest.mark.parametrize("profile_hint", PROFILE_HINTS)
def test_v2_request_accepts_each_canonical_profile_hint(profile_hint: str):
    request = PlanGenerateRequest.model_validate(
        {"goal_id": 7, "content_version": 2, "profile_hint": profile_hint}
    )

    assert request.profile_hint == profile_hint
    # The legacy default may be synthesized, but is not an explicit second hint.
    assert request.subject_hint == "auto"


@pytest.mark.parametrize("profile_hint", ("history", "general", "unknown-profile"))
def test_v2_request_rejects_noncanonical_profile_hint(profile_hint: str):
    with pytest.raises(ValidationError):
        PlanGenerateRequest.model_validate(
            {"goal_id": 7, "content_version": 2, "profile_hint": profile_hint}
        )


def test_profile_hint_is_v2_only_and_legacy_v1_defaults_are_unchanged():
    legacy = PlanGenerateRequest.model_validate({"goal_id": 7})

    assert legacy.content_version == 1
    assert legacy.subject_hint is None
    assert legacy.profile_hint is None
    with pytest.raises(ValidationError):
        PlanGenerateRequest.model_validate(
            {"goal_id": 7, "content_version": 1, "profile_hint": "auto"}
        )
    with pytest.raises(ValidationError):
        PlanGenerateRequest.model_validate({"goal_id": 7, "subject_hint": "history"})


def test_v2_omitted_hints_keep_the_legacy_auto_default():
    request = PlanGenerateRequest.model_validate({"goal_id": 7, "content_version": 2})

    assert request.subject_hint == "auto"
    assert request.profile_hint is None


@pytest.mark.parametrize(
    ("subject_hint", "profile_hint"),
    (
        ("history", "critical_argumentative"),
        ("mathematics", "logical_deductive"),
        ("auto", "auto"),
    ),
)
def test_explicit_equivalent_hints_are_accepted(subject_hint: str, profile_hint: str):
    request = PlanGenerateRequest.model_validate(
        {
            "goal_id": 7,
            "content_version": 2,
            "subject_hint": subject_hint,
            "profile_hint": profile_hint,
        }
    )

    assert request.subject_hint == subject_hint
    assert request.profile_hint == profile_hint


@pytest.mark.parametrize(
    ("subject_hint", "profile_hint"),
    (
        ("history", "linguistic_interpretive"),
        ("mathematics", "applied_practical"),
        ("auto", "systemic_empirical"),
        ("general", "logical_deductive"),
    ),
)
def test_explicit_non_equivalent_hints_are_rejected(subject_hint: str, profile_hint: str):
    with pytest.raises(ValidationError):
        PlanGenerateRequest.model_validate(
            {
                "goal_id": 7,
                "content_version": 2,
                "subject_hint": subject_hint,
                "profile_hint": profile_hint,
            }
        )


def test_profile_hint_reaches_storage_through_public_plan_generation(client, monkeypatch):
    from app.db.session import SessionLocal
    from app.services.plan_service import PlanService

    goal_id = _create_goal(client, "Profile persistence")
    doc = indexed_doc(client)
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", lambda plan_id: scheduled.append(plan_id)
    )

    response = client.post(
        "/plans/generate",
        json={"goal_id": goal_id, "document_ids": [doc], "content_version": 2, "profile_hint": "critical_argumentative"},
        headers={"Idempotency-Key": "profile-persistence-1"},
    )

    assert response.status_code == 202
    plan_id = response.json()["id"]
    public_plan = client.get(f"/plans/{plan_id}")
    assert public_plan.status_code == 200
    assert "profile_hint" not in public_plan.json()
    with SessionLocal() as db:
        stored_plan = PlanService(db).get_plan(1, plan_id)
        assert stored_plan.content_version == 2
        assert stored_plan.subject_hint == "auto"
        assert stored_plan.profile_hint == "critical_argumentative"
    assert scheduled == [plan_id]


def test_v2_identity_normalizes_aliases_and_separates_different_profiles(client, monkeypatch):
    goal_id = _create_goal(client, "Profile identity")
    doc = indexed_doc(client)
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", lambda plan_id: scheduled.append(plan_id)
    )
    headers = {"Idempotency-Key": "profile-identity-1"}

    first = client.post(
        "/plans/generate",
        json={"goal_id": goal_id, "document_ids": [doc], "content_version": 2, "profile_hint": "critical_argumentative"},
        headers=headers,
    )
    alias_replay = client.post(
        "/plans/generate",
        json={"goal_id": goal_id, "document_ids": [doc], "content_version": 2, "subject_hint": "history"},
        headers=headers,
    )
    explicit_null_alias_replay = client.post(
        "/plans/generate",
        json={
            "goal_id": goal_id,
            "document_ids": [doc],
            "content_version": 2,
            "subject_hint": "history",
            "profile_hint": None,
        },
        headers=headers,
    )
    different_profile = client.post(
        "/plans/generate",
        json={"goal_id": goal_id, "document_ids": [doc], "content_version": 2, "profile_hint": "logical_deductive"},
        headers=headers,
    )

    assert first.status_code == alias_replay.status_code == 202
    assert explicit_null_alias_replay.status_code == 202
    assert first.json()["id"] == alias_replay.json()["id"]
    assert first.json()["id"] == explicit_null_alias_replay.json()["id"]
    assert different_profile.status_code == 409
    assert different_profile.json() == {
        "detail": "La clave de idempotencia ya se utilizó con una solicitud diferente.",
        "code": "IDEMPOTENCY_KEY_REUSED",
    }
    assert [plan["id"] for plan in _plans_for_goal(client, goal_id)] == [first.json()["id"]]
    assert scheduled == [first.json()["id"]]


def test_v1_identity_is_unchanged_and_cannot_replay_as_v2(client, monkeypatch):
    goal_id = _create_goal(client, "Versioned identity")
    d1, d2 = indexed_doc(client), indexed_doc(client)
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", lambda plan_id: scheduled.append(plan_id)
    )
    headers = {"Idempotency-Key": "versioned-identity-1"}

    legacy = client.post(
        "/plans/generate",
        json={"goal_id": goal_id, "document_ids": [d2, d1, d2]},
        headers=headers,
    )
    legacy_replay = client.post(
        "/plans/generate",
        json={"goal_id": goal_id, "document_ids": [d1, d2], "content_version": 1},
        headers=headers,
    )
    adaptive_replay = client.post(
        "/plans/generate",
        json={"goal_id": goal_id, "document_ids": [d1, d2], "content_version": 2,
              "profile_hint": "logical_deductive"},
        headers=headers,
    )

    assert legacy.status_code == legacy_replay.status_code == 202
    assert legacy.json()["id"] == legacy_replay.json()["id"]
    assert adaptive_replay.status_code == 409
    assert [plan["id"] for plan in _plans_for_goal(client, goal_id)] == [legacy.json()["id"]]
    assert scheduled == [legacy.json()["id"]]


def test_invalid_profile_requests_are_422_without_plan_or_task_changes(
    client, monkeypatch
):
    goal_id = _create_goal(client, "Invalid profile input")
    before = _plans_for_goal(client, goal_id)
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", lambda plan_id: scheduled.append(plan_id)
    )
    invalid_fields = (
        {"content_version": 1, "profile_hint": "auto"},
        {"content_version": 1, "profile_hint": None},
        {"content_version": 2, "profile_hint": "general"},
        {
            "content_version": 2,
            "subject_hint": "history",
            "profile_hint": "logical_deductive",
        },
    )

    for fields in invalid_fields:
        response = client.post("/plans/generate", json={"goal_id": goal_id, **fields})

        assert response.status_code == 422
        errors = response.json()["detail"]
        assert len(errors) == 1
        assert errors[0]["msg"]
        if fields["content_version"] == 1:
            assert errors[0]["msg"] == "Value error, profile_hint requires content_version=2"
        elif "subject_hint" in fields:
            assert errors[0]["msg"] == (
                "Value error, subject_hint and profile_hint must refer to the same profile"
            )
        else:
            assert errors[0]["type"] == "literal_error"
            assert errors[0]["input"] == "general"
        assert _plans_for_goal(client, goal_id) == before
        assert scheduled == []


def test_v1_plan_response_does_not_expose_internal_profile_hint():
    response = PlanResponse.model_validate(
        {
            "id": 7,
            "title": "Legacy plan",
            "status": "READY",
            "goal_id": 3,
            "document_ids": [],
            "created_at": datetime(2026, 11, 9, tzinfo=timezone.utc),
            "profile_hint": "logical_deductive",
        }
    )

    public = response.model_dump(mode="json")
    assert set(public) == {
        "id",
        "title",
        "status",
        "goal_id",
        "document_ids",
        "created_at",
        "error_message",
        "progress_stage",
        "progress_done",
        "progress_total",
        "topics",
        "sessions",
    }
    assert public["id"] == 7
    assert public["document_ids"] == []


def test_profile_hint_backfill_is_additive_nullable_and_idempotent(tmp_path, monkeypatch):
    from app.db import init_db

    with TemporaryDirectory(dir=tmp_path) as scratch:
        engine = create_engine(f"sqlite:///{scratch}/legacy_plans.db")
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "CREATE TABLE plans (id INTEGER PRIMARY KEY, title VARCHAR(255), "
                        "content_version INTEGER NOT NULL DEFAULT 1, subject_hint VARCHAR(16), "
                        "legacy_payload TEXT NOT NULL)"
                    )
                )
                connection.execute(
                    text(
                        "INSERT INTO plans (id, title, content_version, subject_hint, legacy_payload) "
                        "VALUES (1, 'Kept plan', 1, NULL, 'unchanged')"
                    )
                )

            monkeypatch.setattr(init_db, "engine", engine)
            init_db._ensure_adaptive_content_columns()
            init_db._ensure_adaptive_content_columns()

            columns = {column["name"]: column for column in inspect(engine).get_columns("plans")}
            assert "profile_hint" in columns
            assert columns["profile_hint"]["nullable"] is True
            assert columns["profile_hint"]["default"] is None
            assert list(columns).count("profile_hint") == 1
            with engine.connect() as connection:
                row = connection.execute(
                    text(
                        "SELECT title, content_version, subject_hint, profile_hint, legacy_payload "
                        "FROM plans WHERE id = 1"
                    )
                ).one()
            assert row == ("Kept plan", 1, None, None, "unchanged")
        finally:
            engine.dispose()

    assert Plan.__table__.c.profile_hint.nullable is True
