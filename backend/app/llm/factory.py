"""Selects the LLM provider for a given user.

Priority order:
    1. The user's active ``LLMCredential`` (configured via the settings UI) —
       any of the 5 supported providers.
    2. The operator-level ``ANTHROPIC_API_KEY`` from ``.env`` (legacy path,
       unchanged, keeps existing deployments working with zero migration).
    3. ``MockLLMProvider`` — the deterministic offline fallback that makes the
       whole app runnable with no key at all.

Provider construction is cheap (building an SDK/httpx client, no network I/O),
so — unlike the previous ``lru_cache``d singleton — this is rebuilt on every
call. That's required now that credentials can change at runtime through the
settings UI instead of only at process boot via ``.env``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import LLMError
from app.core.logging import get_logger, safe_model_identifier
from app.core.security import SecretDecryptionError, decrypt_secret
from app.core.url_safety import assert_safe_outbound_url
from app.llm.base import LLMProvider
from app.llm.credential_state import is_verified
from app.llm.mock_provider import MockLLMProvider
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.llm.providers_catalog import PROVIDER_CATALOG
from app.llm.request_profiles import resolve_request_profile
from app.models.llm_credential import LLMCredential, LLMProviderName
from app.repositories.llm_credential_repository import LLMCredentialRepository

logger = get_logger(__name__)

RuntimeSource = Literal["USER", "ENV", "MOCK"]
_RUNTIME_KINDS = ("topic_analysis", "session_plan", "session_content")


@dataclass(frozen=True)
class LLMRuntimeState:
    """Safe description of the provider selected for the next generation."""

    source: RuntimeSource
    provider: LLMProviderName | None
    models: dict[str, str]
    fallback_reason: str | None = None


@dataclass(frozen=True)
class ProviderResolution:
    """The selected provider and the UI-safe state produced by the same decision."""

    provider: LLMProvider
    runtime: LLMRuntimeState


def build_provider_from_credential(
    credential: LLMCredential, *, model_override: str | None = None
) -> LLMProvider:
    """Build a live provider instance from a stored credential.

    Raises ``SecretDecryptionError`` if the ciphertext can't be decrypted
    (e.g. ``SECRET_KEY`` was rotated) — callers decide how to degrade.
    """
    if credential.provider == LLMProviderName.ANTHROPIC and credential.base_url:
        raise LLMError(
            "Anthropic no admite una URL base personalizada. Elimínala para usar la API nativa.",
            code="LLM_UNSUPPORTED_CONFIGURATION",
            provider=credential.provider.value,
        )

    api_key = decrypt_secret(credential.encrypted_api_key)
    meta = PROVIDER_CATALOG[credential.provider]

    if credential.provider == LLMProviderName.ANTHROPIC:
        from app.llm.anthropic_provider import AnthropicProvider

        return AnthropicProvider(
            api_key=api_key, model=model_override or credential.model or meta.default_model
        )

    model = model_override or credential.model or meta.default_model
    request_profile = resolve_request_profile(credential.provider, model)
    settings = get_settings()
    if credential.provider == LLMProviderName.OLLAMA:
        return OpenAICompatibleProvider(
            base_url=f"{settings.OLLAMA_BASE_URL.rstrip('/')}/v1",
            api_key=None,
            model=model,
            timeout=settings.OLLAMA_TIMEOUT_SECONDS,
            max_retries=settings.OLLAMA_MAX_RETRIES,
            max_rate_limit_retries=0,
            generation_policy=settings.ollama_policy,
            test_policy=settings.ollama_policy,
            requires_request_pacing=False,
            request_profile=request_profile,
            provider=credential.provider.value,
        )

    if credential.base_url:
        # Re-check right before use (not just at save time) to shrink the
        # window for a DNS-rebinding SSRF attempt — the hostname could now
        # resolve differently than when the user first saved it.
        assert_safe_outbound_url(credential.base_url)
    base_url = credential.base_url or meta.default_base_url
    return OpenAICompatibleProvider(
        base_url=base_url,
        api_key=api_key,
        model=model,
        timeout=settings.LLM_TIMEOUT_SECONDS,
        max_retries=settings.LLM_MAX_RETRIES,
        max_rate_limit_retries=settings.LLM_MAX_RATE_LIMIT_RETRIES,
        generation_policy=settings.external_generation_policy,
        test_policy=settings.external_test_policy,
        request_profile=request_profile,
        provider=credential.provider.value,
    )


def resolve_llm_provider(db: Session, user_id: int) -> ProviderResolution:
    """Resolve and construct the effective provider without performing network I/O."""
    credential = LLMCredentialRepository(db).find_active_for_user(user_id)
    user_fallback = False
    if credential is not None and is_verified(credential):
        try:
            logger.info("Using user-configured %s provider (model: %s)",
                         credential.provider.value, safe_model_identifier(credential.model) if credential.model else "<default>")
            return ProviderResolution(
                provider=build_provider_from_credential(credential),
                runtime=LLMRuntimeState(
                    source="USER",
                    provider=credential.provider,
                    models={kind: credential.model for kind in _RUNTIME_KINDS},
                ),
            )
        except SecretDecryptionError:
            logger.warning(
                "Active credential for %s could not be decrypted (SECRET_KEY changed?); "
                "falling back.", credential.provider.value,
            )
            user_fallback = True
        except Exception:  # noqa: BLE001 - never let a bad stored credential crash boot
            logger.warning(
                "Could not build provider for stored credential %s; falling back.", credential.provider.value
            )
            user_fallback = True
    elif credential is not None:
        logger.warning("Ignoring active but unverified %s credential.", credential.provider.value)
        user_fallback = True

    settings = get_settings()
    if settings.has_llm_key:
        try:
            from app.llm.anthropic_provider import AnthropicProvider

            logger.info("Using .env Anthropic provider (models: %s / %s)",
                         safe_model_identifier(settings.LLM_MODEL_PLAN), safe_model_identifier(settings.LLM_MODEL_QUIZ))
            return ProviderResolution(
                provider=AnthropicProvider(),
                runtime=LLMRuntimeState(
                    source="ENV",
                    provider=LLMProviderName.ANTHROPIC,
                    models={
                        "topic_analysis": settings.LLM_MODEL_PLAN,
                        "session_plan": settings.LLM_MODEL_PLAN,
                        "session_content": settings.LLM_MODEL_QUIZ,
                    },
                    fallback_reason=(
                        "La configuración activa no está disponible; "
                        "se aplicó la configuración del servidor."
                        if user_fallback
                        else None
                    ),
                ),
            )
        except Exception:  # noqa: BLE001 - never let a bad key crash boot
            logger.warning("Could not initialise Anthropic provider; falling back to mock.")
            fallback_reason = (
                "La configuración activa y la del servidor no están disponibles; "
                "se aplicó el modo demo."
                if user_fallback
                else "La configuración del servidor no está disponible; se usará el modo demo."
            )
    else:
        logger.info("No LLM credential configured — using deterministic mock LLM provider.")
        fallback_reason = (
            "La configuración activa no está disponible; se aplicó el modo demo."
            if user_fallback
            else None
        )
    return ProviderResolution(
        provider=MockLLMProvider(),
        runtime=LLMRuntimeState(
            source="MOCK",
            provider=None,
            models={kind: "simulado" for kind in _RUNTIME_KINDS},
            fallback_reason=fallback_reason,
        ),
    )


def get_llm_provider(db: Session, user_id: int) -> LLMProvider:
    """Build the provider selected by ``resolve_llm_provider``."""
    return resolve_llm_provider(db, user_id).provider
