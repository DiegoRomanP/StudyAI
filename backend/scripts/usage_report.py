"""Cost per plan and per reinforcement from ``llm_usage``.

    python scripts/usage_report.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.models.llm_usage import LLMUsageRecord as U  # noqa: E402


def summarize(db: Session) -> list[dict]:
    """One row per plan (its generation calls) and per reinforcement session, oldest first."""
    group = (U.plan_id, U.session_id)
    rows = db.execute(
        select(
            U.plan_id,
            U.session_id,
            func.count(),
            func.sum(U.input_tokens),
            func.sum(U.output_tokens),
            func.sum(U.cost_usd),
        )
        .group_by(*group)
        .order_by(func.min(U.id))
    )
    return [
        {
            "plan_id": plan_id,
            "session_id": session_id,  # set only for AI reinforcements
            "calls": calls,
            "input_tokens": int(tin or 0),
            "output_tokens": int(tout or 0),
            "cost_usd": cost,  # None when no call had a price in LLM_PRICES_USD_PER_MTOK
        }
        for plan_id, session_id, calls, tin, tout, cost in rows
    ]


def _average(rows: list[dict]) -> str:
    costs = [r["cost_usd"] for r in rows if r["cost_usd"] is not None]
    return f"{sum(costs) / len(costs):.4f} USD" if costs else "sin precios"


def main() -> None:
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        rows = summarize(db)
    print(f"{'plan':>6} {'sesión':>7} {'llamadas':>9} {'entrada':>9} {'salida':>8} {'USD':>10}")
    for r in rows:
        usd = "-" if r["cost_usd"] is None else f"{r['cost_usd']:.4f}"
        print(f"{r['plan_id'] or '-':>6} {r['session_id'] or '-':>7} {r['calls']:>9} "
              f"{r['input_tokens']:>9} {r['output_tokens']:>8} {usd:>10}")
    print("Promedio por plan:", _average([r for r in rows if r["session_id"] is None]))
    print("Promedio por refuerzo:", _average([r for r in rows if r["session_id"] is not None]))


if __name__ == "__main__":
    main()
