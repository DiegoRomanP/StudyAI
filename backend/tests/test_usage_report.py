from decimal import Decimal

from sqlalchemy import delete

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.llm_usage import LLMUsageRecord
from scripts.usage_report import summarize


def _row(plan_id, session_id, tin, tout, cost):
    return LLMUsageRecord(
        user_id=1, plan_id=plan_id, session_id=session_id, kind="session_content",
        provider="P", model="m", input_tokens=tin, output_tokens=tout, cost_usd=cost,
    )


def test_summarize_totals_per_plan_and_reinforcement():
    Base.metadata.create_all(engine)  # this file may run without the app lifespan
    with SessionLocal() as db:
        db.execute(delete(LLMUsageRecord))
        db.add_all([
            _row(1, None, 100, 10, Decimal("0.01")),
            _row(1, None, 200, 20, Decimal("0.02")),
            _row(1, 5, 50, 5, Decimal("0.005")),
        ])
        db.commit()
        rows = summarize(db)
        db.execute(delete(LLMUsageRecord))
        db.commit()

    assert rows == [
        {"plan_id": 1, "session_id": None, "calls": 2, "input_tokens": 300, "output_tokens": 30, "cost_usd": Decimal("0.03")},
        {"plan_id": 1, "session_id": 5, "calls": 1, "input_tokens": 50, "output_tokens": 5, "cost_usd": Decimal("0.005")},
    ]
