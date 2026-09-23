"""Selects the LLM provider for a given user.

Priority order:
    1. The user's active ``LLMCredential`` configured through the settings UI.
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
from app.llm.base import LLMProvider
from app.llm.credential_state import is_verified
from app.llm.mock_provider import MockLLMProvider
from app.llm.provider_registry import get_provider_definition
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
    api_key = decrypt_secret(credential.encrypted_api_key)
    definition = get_provider_definition(credential.provider)
    model = model_override or credential.model or definition.meta.default_model
    try:
        definition.validate_model(model)
        # Re-check custom URLs immediately before runtime use to reduce the
        # DNS-rebinding window after a draft was saved.
        definition.validate_base_url(credential.base_url)
        return definition.build_provider(credential, api_key=api_key, model=model)
    except Exception as exc:
        if isinstance(exc, LLMError):
            raise
        raise LLMError(
            "La configuracion guardada no es compatible con este proveedor.",
            code="LLM_UNSUPPORTED_CONFIGURATION",
            provider=credential.provider.value,
        ) from exc


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
