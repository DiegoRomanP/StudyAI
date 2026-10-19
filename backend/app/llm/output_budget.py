"""Output budgets per call kind, with one retry when a model runs out of room."""

from __future__ import annotations

from collections.abc import Callable

from app.core.exceptions import LLMError
from app.core.logging import get_logger
from app.llm.base import LLMProvider

logger = get_logger(__name__)

OUTPUT_BUDGETS: dict[str, int] = {
    "topic_analysis": 2048,
    "session_plan": 1024,
    "session_content": 4096,
}
MAX_OUTPUT_BUDGET = 8192


def complete_within_budget(
    llm: LLMProvider,
    *,
    kind: str,
    system: str,
    prompt: str,
    context: dict | None = None,
    escalate: bool = True,
    before_retry: Callable[[], None] | None = None,
) -> str:
    budget = OUTPUT_BUDGETS[kind]
    try:
        return llm.complete(kind=kind, system=system, prompt=prompt, context=context, max_tokens=budget)
    except LLMError as exc:
        if not escalate or exc.code != "LLM_OUTPUT_LIMIT":
            raise
    retry_budget = min(budget * 2, MAX_OUTPUT_BUDGET)
    logger.warning("LLM output limit operation=%s budget=%d; retrying once with %d", kind, budget, retry_budget)
    if before_retry is not None:
        before_retry()
    return llm.complete(kind=kind, system=system, prompt=prompt, context=context, max_tokens=retry_budget)
