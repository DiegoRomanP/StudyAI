"""Free-tier AI that ships with the server, so a learner can generate a plan without a key.

A chain of tiers (today a single one: DeepSeek) behind the ordinary ``LLMProvider``
interface. A tier that runs out of quota, is rate limited, stalls or is unavailable is
skipped for a cooldown; when none is left the learner is asked to connect their own AI.
The key comes from the operator's environment and is used only to build the provider
client, never logged.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

from app.core.config import Settings
from app.core.exceptions import LLMError
from app.core.logging import get_logger
from app.llm.base import LLMProvider
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.llm.providers.deepseek import definition as deepseek_definition
from app.models.llm_credential import LLMProviderName

logger = get_logger(__name__)

# Seconds a tier is skipped after failing, by error code. Anything not listed is a problem
# with one response (bad JSON, refusal): the next tier is tried but this one stays in line.
_COOLDOWN_SECONDS = {
    "LLM_QUOTA_EXHAUSTED": 30 * 60,
    "LLM_AUTHENTICATION_FAILED": 30 * 60,
    "LLM_ACCESS_DENIED": 30 * 60,
    "LLM_MODEL_UNAVAILABLE": 30 * 60,
    "LLM_ENDPOINT_OR_MODEL_UNAVAILABLE": 30 * 60,
    "LLM_UNSUPPORTED_CONFIGURATION": 30 * 60,
    "LLM_RATE_LIMITED": 60,
    "LLM_TIMEOUT": 2 * 60,
    "LLM_CONNECTION_FAILED": 2 * 60,
    "LLM_PROVIDER_UNAVAILABLE": 2 * 60,
    "LLM_ASYNC_RESULT_UNAVAILABLE": 2 * 60,
}
_EXHAUSTED_MESSAGE = (
    "El uso gratuito de IA se agotó por ahora. Conecta tu propia IA en «Conectar IA» "
    "o inténtalo más tarde."
)

_cooldown_until: dict[str, float] = {}
_lock = threading.Lock()


def reset_cooldowns() -> None:
    """Forget every tier failure (used by tests)."""
    with _lock:
        _cooldown_until.clear()


def _cooling_down(tier: str) -> bool:
    with _lock:
        return _cooldown_until.get(tier, 0.0) > time.monotonic()


def _start_cooldown(tier: str, error: LLMError) -> None:
    seconds = _COOLDOWN_SECONDS.get(error.code)
    if error.code == "LLM_RATE_LIMITED" and error.retry_after_seconds:
        seconds = max(seconds or 0, error.retry_after_seconds)
    if seconds is None:
        return
    with _lock:
        _cooldown_until[tier] = time.monotonic() + seconds


@dataclass(frozen=True)
class FreeTier:
    name: str
    provider: LLMProviderName
    model: str
    build: Callable[[], LLMProvider]


def build_free_tiers(settings: Settings) -> list[FreeTier]:
    """The configured tiers in priority order; empty when the operator set no key."""
    if not settings.has_free_ai:
        return []
    policy = settings.default_ai_policy
    model = settings.DEFAULT_DEEPSEEK_MODEL
    return [
        FreeTier(
            name="deepseek",
            provider=LLMProviderName.DEEPSEEK,
            model=model,
            build=lambda: OpenAICompatibleProvider(
                base_url=deepseek_definition.meta.default_base_url or "",
                api_key=settings.DEEPSEEK_API_KEY.strip(),
                model=model,
                request_profile=deepseek_definition.request_profile(model),
                generation_policy=policy,
                test_policy=policy,
                provider=LLMProviderName.DEEPSEEK.value,
            ),
        )
    ]


class FreeTierProvider(LLMProvider):
    """Tries each free tier in order, moving on when one cannot answer."""

    def __init__(self, tiers: list[FreeTier]) -> None:
        if not tiers:
            raise ValueError("FreeTierProvider needs at least one tier.")
        self._tiers = tiers
        self._built: dict[str, LLMProvider] = {}

    def complete(
        self,
        *,
        kind: str,
        system: str,
        prompt: str,
        context: dict | None = None,
        max_tokens: int = 4096,
    ) -> str:
        last_error: LLMError | None = None
        quota_like = True
        attempted = False
        for tier in self._tiers:
            if _cooling_down(tier.name):
                continue
            attempted = True
            try:
                provider = self._built.get(tier.name)
                if provider is None:
                    provider = self._built[tier.name] = tier.build()
                return provider.complete(
                    kind=kind, system=system, prompt=prompt, context=context, max_tokens=max_tokens
                )
            except LLMError as exc:
                if exc.code == "LLM_OUTPUT_LIMIT":  # the caller retries with more room
                    raise
                last_error = exc
                quota_like = quota_like and exc.code in _COOLDOWN_SECONDS
                _start_cooldown(tier.name, exc)
                logger.warning("Free AI tier %s failed (%s); trying the next one.", tier.name, exc.code)
        if not attempted or (last_error is not None and quota_like):
            raise LLMError(_EXHAUSTED_MESSAGE, code="LLM_QUOTA_EXHAUSTED", retryable=False)
        assert last_error is not None
        raise last_error

    def close(self) -> None:
        for provider in self._built.values():
            provider.close()
        self._built.clear()
