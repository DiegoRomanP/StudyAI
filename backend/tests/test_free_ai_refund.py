"""A plan's free AI use is refunded exactly once, on the UTC day it was spent."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from app.db.session import SessionLocal
from app.llm.mock_provider import MockLLMProvider
from app.models.free_ai_usage import FreeAiUsage
from app.models.plan import Plan
from app.services import plan_service
from app.services.free_ai_quota import utc_today
from app.services.plan_service import PlanService, _refund_plan_use
from tests.test_default_free_provider import _free_ai_client, _goal, _reset_usage

USER_ID = 1


def _uses(day=None) -> int:
    with SessionLocal() as db:
        row = db.scalar(
            select(FreeAiUsage).where(
                FreeAiUsage.user_id == USER_ID, FreeAiUsage.usage_date == (day or utc_today())
            )
        )
        return row.uses if row else 0


def _free_plan(client) -> int:
    """A plan that spent today's free use; its generation task is not run."""
    client.post("/llm-settings/deactivate-all")
    response = client.post("/plans/generate", json={"goal_id": _goal(client), "document_ids": []})
    assert response.status_code == 202
    return response.json()["id"]


def _spent_day(plan_id: int):
    with SessionLocal() as db:
        return db.scalar(select(Plan.free_ai_use_date).where(Plan.id == plan_id))


def test_the_refund_happens_once_even_if_requested_twice(monkeypatch):
    with _free_ai_client(monkeypatch) as client:
        _reset_usage()
        plan_id = _free_plan(client)
        assert _uses() == 1 and _spent_day(plan_id) == utc_today()

        with SessionLocal() as db:
            _refund_plan_use(db, plan_id, USER_ID, utc_today())
            _refund_plan_use(db, plan_id, USER_ID, utc_today())

        assert _uses() == 0
        assert _spent_day(plan_id) is None


def test_the_refund_goes_to_the_day_the_use_was_spent(monkeypatch):
    yesterday = utc_today() - timedelta(days=1)
    with _free_ai_client(monkeypatch) as client:
        _reset_usage()
        plan_id = _free_plan(client)
        with SessionLocal() as db:
            db.add(FreeAiUsage(user_id=USER_ID, usage_date=yesterday, uses=1))
            db.get(Plan, plan_id).free_ai_use_date = yesterday
            db.commit()

        with SessionLocal() as db:
            _refund_plan_use(db, plan_id, USER_ID, None)

        assert _uses(yesterday) == 0
        assert _uses() == 1


def test_a_ready_plan_clears_the_spent_day(monkeypatch):
    with _free_ai_client(monkeypatch) as client:
        _reset_usage()
        plan_id = _free_plan(client)
        monkeypatch.setattr(plan_service, "get_llm_provider", lambda *_: MockLLMProvider())

        plan_service.generate_plan_task(plan_id)

        assert client.get(f"/plans/{plan_id}").json()["status"] == "READY"
        assert _spent_day(plan_id) is None
        assert _uses() == 1


class _DeletesThePlan(MockLLMProvider):
    def __init__(self, plan_id: int) -> None:
        super().__init__()
        self.plan_id = plan_id
        self.deleted = False

    def complete(self, *, kind, **kwargs):
        if kind == "session_content" and not self.deleted:
            with SessionLocal() as other:
                PlanService(other).delete_plan(USER_ID, self.plan_id)
            self.deleted = True
        return super().complete(kind=kind, **kwargs)


def test_a_plan_deleted_mid_generation_gives_its_use_back(monkeypatch):
    with _free_ai_client(monkeypatch) as client:
        _reset_usage()
        plan_id = _free_plan(client)
        provider = _DeletesThePlan(plan_id)
        monkeypatch.setattr(plan_service, "get_llm_provider", lambda *_: provider)

        plan_service.generate_plan_task(plan_id)

        assert provider.deleted
        assert client.get(f"/plans/{plan_id}").status_code == 404
        assert _uses() == 0
