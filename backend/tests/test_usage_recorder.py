"""llm_usage rows: written per call, on failure too, with cost from the price table."""

from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from app.core.config import get_settings
from app.core.exceptions import LLMError
from app.db.session import SessionLocal
from app.llm.base import LLMProvider
from app.llm.output_budget import complete_within_budget
from app.llm.usage import LLMUsage
from app.models.llm_usage import LLMUsageRecord
from app.services.usage_recorder import UsageRecorder, cost_usd
from tests.helpers import indexed_doc


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


class _Billed(LLMProvider):
    """Reports usage for every call, then fails with LLM_OUTPUT_LIMIT."""

    def complete(self, *, kind, system, prompt, context=None, max_tokens=4096):
        self._record_usage(LLMUsage("P", "model-x", 100, max_tokens))
        raise LLMError("sin espacio", code="LLM_OUTPUT_LIMIT")


def _rows(**filters) -> list[LLMUsageRecord]:
    with SessionLocal() as db:
        return list(db.scalars(select(LLMUsageRecord).filter_by(**filters)))


def test_failed_generation_still_records_usage(client):
    recorder = UsageRecorder(user_id=1, plan_id=987001)

    with pytest.raises(LLMError):
        complete_within_budget(_Billed(), kind="session_content", system="s", prompt="p", recorder=recorder)

    rows = _rows(plan_id=987001)  # fresh session: survives any rollback of the caller's
    assert [(r.success, r.error_code, r.output_tokens) for r in rows] == [
        (False, "LLM_OUTPUT_LIMIT", 4096),
        (False, "LLM_OUTPUT_LIMIT", 8192),
    ]


def test_cost_uses_price_table(monkeypatch):
    monkeypatch.setitem(get_settings().LLM_PRICES_USD_PER_MTOK, "m", [1.0, 5.0, 0.1])

    assert cost_usd("m", LLMUsage("P", "m", 1_000_000, 200_000, 0)) == Decimal("2.000000")
    # Cached input is billed at the cached rate, not the full one.
    assert cost_usd("m", LLMUsage("P", "m", 1_000_000, 0, 1_000_000)) == Decimal("0.100000")


def test_unknown_model_has_null_cost():
    assert cost_usd("nope", LLMUsage("P", "nope", 10, 10)) is None


def test_plan_generation_records_two_plus_n_rows(client):
    # SQLite reuses the ids of plans deleted by earlier tests, and usage rows outlive their plan.
    last_id = max((r.id for r in _rows()), default=0)
    goal_id = client.post("/goals", json={"goal_type": "EXAM", "title": "Uso", "description": ""}).json()["id"]
    plan_id = client.post(
        "/plans/generate", json={"goal_id": goal_id, "document_ids": [indexed_doc(client)]}
    ).json()["id"]
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "READY"

    rows = [r for r in _rows(plan_id=plan_id) if r.id > last_id]

    assert len(rows) == 2 + len(plan["sessions"])
    assert {r.kind for r in rows} == {"topic_analysis", "session_plan", "session_content"}
    assert all(r.success for r in rows)
