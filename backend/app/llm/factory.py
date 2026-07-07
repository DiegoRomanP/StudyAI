"""Selects the LLM provider based on configuration.

Real Anthropic client when an API key is present; the deterministic mock
otherwise. Cached so the (potentially expensive) SDK client is built once.
"""

from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.core.logging import get_logger
from app.llm.base import LLMProvider
from app.llm.mock_provider import MockLLMProvider

logger = get_logger(__name__)


@lru_cache
def get_llm_provider() -> LLMProvider:
    settings = get_settings()
    if settings.has_llm_key:
        try:
            from app.llm.anthropic_provider import AnthropicProvider

            logger.info("Using Anthropic LLM provider (models: %s / %s)",
                        settings.LLM_MODEL_PLAN, settings.LLM_MODEL_QUIZ)
            return AnthropicProvider()
        except Exception as exc:  # noqa: BLE001 - never let a bad key crash boot
            logger.warning(
                "Could not initialise Anthropic provider (%s); falling back to mock.",
                exc,
            )
    else:
        logger.info("No ANTHROPIC_API_KEY set — using deterministic mock LLM provider.")
    return MockLLMProvider()
