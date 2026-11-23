"""saas: one credit per new plan and per AI reinforcement, refunded exactly once; resume is free."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

import main
from app.core.config import get_settings
from app.core.exceptions import LLMError
from app.db.session import SessionLocal
from app.llm.mock_provider import MockLLMProvider
from app.models.credit_ledger import CreditLedger, CreditReason
from app.models.free_ai_usage import FreeAiUsage
from app.models.plan import Plan, PlanStatus
from app.models.user import User
from app.services.credit_service import TIER_LIMITS
from app.services import plan_service, reinforcement_service
from app.services.plan_service import _refund_plan_use, recover_interrupted_plans
from tests.helpers import indexed_doc
from tests.test_reinforcement import _Scripted, _review, _use_provider, tasks  # noqa: F401 - fixture

USER_ID = 1


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def created_plans(client):
    plan_ids: list[int] = []
    yield plan_ids
    for plan_id in plan_ids:
        client.delete(f"/plans/{plan_id}")


@pytest.fixture(autouse=True)
def _empty_ledger():
    """SQLite reuses the ids of deleted plans (Postgres sequences never do), and keys embed the id."""
    with SessionLocal() as db:
        db.execute(CreditLedger.__table__.delete())
        db.commit()


@pytest.fixture
def saas(monkeypatch):
    monkeypatch.setattr(get_settings(), "DEPLOYMENT_MODE", "saas")
    monkeypatch.setitem(TIER_LIMITS, "free", (None, None))  # these tests are about credits, not tier limits


def set_credits(n: int) -> None:
    with SessionLocal() as db:
        db.get(User, USER_ID).credit_balance = n
        db.commit()


def credits() -> int:
    with SessionLocal() as db:
        return db.execute(select(User.credit_balance).where(User.id == USER_ID)).scalar_one()


def ledger(reason: CreditReason, reference_id: int) -> int:
    with SessionLocal() as db:
        return db.scalar(
            select(func.count()).where(
                CreditLedger.user_id == USER_ID, CreditLedger.reason == reason,
                CreditLedger.reference_id == reference_id,
            )
        )


def plan_count() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(Plan))


def _body(client) -> dict:
    goal = client.post("/goals", json={"goal_type": "LEARNING", "title": "Créditos", "description": ""}).json()
    return {"goal_id": goal["id"], "document_ids": [indexed_doc(client)]}


def _generate(client, body, created_plans, **kw):
    response = client.post("/plans/generate", json=body, **kw)
    if response.status_code == 202:
        created_plans.append(response.json()["id"])
    return response


def test_plan_charges_one_credit(client, saas, monkeypatch, created_plans):
    body = _body(client)
    monkeypatch.setattr(plan_service, "get_llm_provider", lambda *_: MockLLMProvider())
    set_credits(2)

    response = _generate(client, body, created_plans)

    plan_id = response.json()["id"]
    assert response.status_code == 202
    assert client.get(f"/plans/{plan_id}").json()["status"] == "READY"
    assert credits() == 1
    assert ledger(CreditReason.PLAN, plan_id) == 1
    with SessionLocal() as db:  # a finished plan holds no charge to refund
        assert db.get(Plan, plan_id).charge_ledger_id is None


def test_failed_plan_refunds_once(client, saas, monkeypatch, created_plans):
    body = _body(client)
    monkeypatch.setattr(
        plan_service, "get_llm_provider",
        lambda *_: _Scripted(error=LLMError("caído", code="LLM_PROVIDER_ERROR")),
    )
    set_credits(2)

    plan_id = _generate(client, body, created_plans).json()["id"]

    assert client.get(f"/plans/{plan_id}").json()["status"] == "FAILED"
    assert credits() == 2
    assert ledger(CreditReason.REFUND, plan_id) == 1
    with SessionLocal() as db:  # a second refund request is a no-op
        _refund_plan_use(db, plan_id, USER_ID, None)
    assert credits() == 2 and ledger(CreditReason.REFUND, plan_id) == 1


def test_resume_is_free_in_saas(client, saas, monkeypatch, created_plans):
    body = _body(client)
    monkeypatch.setattr(plan_service, "get_llm_provider", lambda *_: _Scripted(error=RuntimeError("x")))
    set_credits(1)
    plan_id = _generate(client, body, created_plans).json()["id"]
    assert credits() == 1  # charged and refunded

    monkeypatch.setattr(plan_service, "get_llm_provider", lambda *_: MockLLMProvider())
    assert client.post(f"/plans/{plan_id}/resume").status_code == 202

    assert client.get(f"/plans/{plan_id}").json()["status"] == "READY"
    assert credits() == 1
    assert ledger(CreditReason.PLAN, plan_id) == 1  # no second charge


def test_double_create_with_same_idempotency_key_charges_once(client, saas, monkeypatch, created_plans):
    body = _body(client)
    monkeypatch.setattr(plan_service, "get_llm_provider", lambda *_: MockLLMProvider())
    set_credits(3)
    headers = {"Idempotency-Key": "double-click-1"}

    first = _generate(client, body, created_plans, headers=headers)
    second = _generate(client, body, created_plans, headers=headers)

    assert first.json()["id"] == second.json()["id"]
    assert credits() == 2


def test_no_credits_returns_402_and_creates_nothing(client, saas, monkeypatch, created_plans):
    body = _body(client)
    monkeypatch.setattr(plan_service, "get_llm_provider", lambda *_: MockLLMProvider())
    set_credits(1)
    before = plan_count()

    first = _generate(client, body, created_plans)
    second = _generate(client, body, created_plans)  # the double click on the last credit

    assert first.status_code == 202
    assert second.status_code == 402
    assert second.json()["code"] == "INSUFFICIENT_CREDITS"
    assert credits() == 0  # never negative
    assert plan_count() == before + 1  # the refused request left no plan row behind


def test_llm_failure_does_not_consume_a_credit_for_resume_retries(client, saas, monkeypatch, created_plans):
    body = _body(client)
    monkeypatch.setattr(plan_service, "get_llm_provider", lambda *_: _Scripted(error=RuntimeError("x")))
    set_credits(1)
    plan_id = _generate(client, body, created_plans).json()["id"]

    for _ in range(2):  # failing resumes cost nothing and refund nothing extra
        client.post(f"/plans/{plan_id}/resume")
    assert credits() == 1
    assert ledger(CreditReason.REFUND, plan_id) == 1


def test_startup_recovery_refunds_plan(client, saas, monkeypatch, created_plans):
    body = _body(client)
    monkeypatch.setattr("app.api.v1.routes.plans.generate_plan_task", lambda *_: None)
    set_credits(1)
    plan_id = _generate(client, body, created_plans).json()["id"]
    assert credits() == 0

    with SessionLocal() as db:
        recover_interrupted_plans(db)
        recover_interrupted_plans(db)

    assert credits() == 1
    assert ledger(CreditReason.REFUND, plan_id) == 1
    with SessionLocal() as db:
        assert db.get(Plan, plan_id).status == PlanStatus.FAILED


def test_reinforcement_charge_and_task_refund(client, created_plans, monkeypatch, tasks):  # noqa: F811
    _, review_id = _review(client, created_plans, "Refuerzo créditos")  # built in self_hosted
    monkeypatch.setattr(get_settings(), "DEPLOYMENT_MODE", "saas")
    set_credits(2)

    assert client.post(f"/sessions/{review_id}/reinforcement").status_code == 202
    assert client.post(f"/sessions/{review_id}/reinforcement").status_code == 202  # replay
    assert credits() == 1 and len(tasks) == 1

    _use_provider(monkeypatch, _Scripted(error=RuntimeError("x")))
    reinforcement_service.generate_reinforcement_task(*tasks[0])
    reinforcement_service.generate_reinforcement_task(*tasks[0])  # a repeated refund changes nothing
    assert credits() == 2
    assert ledger(CreditReason.REFUND, review_id) == 1

    assert client.post(f"/sessions/{review_id}/reinforcement").status_code == 202  # retry = new attempt
    assert credits() == 1

    set_credits(0)
    client.post(f"/sessions/{review_id}/reinforcement/cancel")
    response = client.post(f"/sessions/{review_id}/reinforcement")
    assert response.status_code == 402
    assert client.get(f"/sessions/{review_id}").json()["reinforcement_status"] == "NONE"  # claim released


def test_self_hosted_ignores_credits(client, created_plans, monkeypatch, tasks):  # noqa: F811
    _, review_id = _review(client, created_plans, "Refuerzo sin créditos")
    set_credits(0)
    with SessionLocal() as db:
        before = db.scalar(select(func.count()).select_from(CreditLedger))

    assert get_settings().DEPLOYMENT_MODE == "self_hosted"
    assert client.post(f"/sessions/{review_id}/reinforcement").status_code == 202

    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(CreditLedger)) == before
        assert db.scalar(select(func.count()).select_from(FreeAiUsage).where(FreeAiUsage.uses < 0)) == 0
