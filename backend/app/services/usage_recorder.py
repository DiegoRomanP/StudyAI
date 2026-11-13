"""Writes LLM token usage and cost to ``llm_usage``.

Uses its own DB session and commits at once: the plan generator rolls back on
failure, which would otherwise erase exactly the rows for calls that were billed.
"""

from __future__ import annotations

import time
from decimal import Decimal

from app.core.config import get_settings
from app.core.exceptions import LLMError
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.llm.base import LLMProvider
from app.llm.usage import LLMUsage
from app.models.llm_usage import LLMUsageRecord

logger = get_logger(__name__)
_MILLION = Decimal(1_000_000)


def cost_usd(model: str, usage: LLMUsage) -> Decimal | None:
    """USD cost from ``LLM_PRICES_USD_PER_MTOK``; None when the model has no price."""
    prices = get_settings().LLM_PRICES_USD_PER_MTOK.get(model)
    if not prices or len(prices) < 2:
        return None
    price_in, price_out = Decimal(str(prices[0])), Decimal(str(prices[1]))
    price_cached = Decimal(str(prices[2])) if len(prices) > 2 else price_in
    fresh = max(usage.input_tokens - usage.cached_input_tokens, 0)
    total = (fresh * price_in + usage.cached_input_tokens * price_cached + usage.output_tokens * price_out) / _MILLION
    return total.quantize(Decimal("0.000001"))


class UsageRecorder:
    def __init__(self, *, user_id: int, plan_id: int | None = None, session_id: int | None = None) -> None:
        self.user_id = user_id
        self.plan_id = plan_id
        self.session_id = session_id

    def record(self, *, llm: LLMProvider, kind: str, started: float, error: LLMError | None) -> None:
        """Never raises: accounting must not break a generation."""
        try:
            usages = llm.drain_usage()
            latency_ms = int((time.monotonic() - started) * 1000)
            if not usages:  # no response arrived (timeout, 5xx): still a call worth seeing
                usages = [LLMUsage(type(llm).__name__, "", 0, 0)]
            with SessionLocal() as db:
                for usage in usages:
                    db.add(
                        LLMUsageRecord(
                            user_id=self.user_id,
                            plan_id=self.plan_id,
                            session_id=self.session_id,
                            kind=kind,
                            provider=usage.provider,
                            model=usage.model,
                            input_tokens=usage.input_tokens,
                            output_tokens=usage.output_tokens,
                            cached_input_tokens=usage.cached_input_tokens,
                            cost_usd=cost_usd(usage.model, usage),
                            latency_ms=latency_ms,
                            success=error is None,
                            error_code=error.code if error is not None else None,
                        )
                    )
                db.commit()
        except Exception:  # noqa: BLE001
            logger.warning("Could not record LLM usage for kind=%s", kind)
