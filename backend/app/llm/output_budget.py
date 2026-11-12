"""Output budgets per call kind, with one retry when a model runs out of room."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import TYPE_CHECKING

from app.core.exceptions import LLMError
from app.core.logging import get_logger
from app.llm.base import LLMProvider

if TYPE_CHECKING:
    from app.services.usage_recorder import UsageRecorder

logger = get_logger(__name__)

OUTPUT_BUDGETS: dict[str, int] = {
    "topic_analysis": 2048,
    "session_plan": 1024,
    "session_content": 4096,
}
MAX_OUTPUT_BUDGET = 8192


def _attempt(
    llm: LLMProvider, recorder: UsageRecorder | None, *, kind: str, system: str, prompt: str,
    context: dict | None, max_tokens: int,
) -> str:
    """One provider call; records its usage even when it fails (the provider still bills it)."""
    started = time.monotonic()
    try:
        result = llm.complete(kind=kind, system=system, prompt=prompt, context=context, max_tokens=max_tokens)
    except LLMError as exc:
        if recorder is not None:
            recorder.record(llm=llm, kind=kind, started=started, error=exc)
        raise
    if recorder is not None:
        recorder.record(llm=llm, kind=kind, started=started, error=None)
    return result


def complete_within_budget(
    llm: LLMProvider,
    *,
    kind: str,
    system: str,
    prompt: str,
    context: dict | None = None,
    escalate: bool = True,
    before_retry: Callable[[], None] | None = None,
    recorder: UsageRecorder | None = None,
) -> str:
    budget = OUTPUT_BUDGETS[kind]
    try:
        return _attempt(llm, recorder, kind=kind, system=system, prompt=prompt, context=context, max_tokens=budget)
    except LLMError as exc:
        if not escalate or exc.code != "LLM_OUTPUT_LIMIT":
            raise
    retry_budget = min(budget * 2, MAX_OUTPUT_BUDGET)
    logger.warning("LLM output limit operation=%s budget=%d; retrying once with %d", kind, budget, retry_budget)
    if before_retry is not None:
        before_retry()
    return _attempt(llm, recorder, kind=kind, system=system, prompt=prompt, context=context, max_tokens=retry_budget)
