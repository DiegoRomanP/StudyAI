"""Derived state for a stored LLM credential.

The verification fingerprint intentionally contains configuration metadata only;
the API key is never used as fingerprint input or returned to callers.
"""

from __future__ import annotations

from hashlib import sha256

from app.llm.provider_registry import get_provider_definition
from app.models.llm_credential import LLMCredential


def effective_base_url(credential: LLMCredential) -> str:
    """Return the exact base URL used when building this credential's provider."""
    return get_provider_definition(credential.provider).effective_base_url(credential)


def verification_fingerprint(credential: LLMCredential) -> str:
    """Hash the configuration that a successful connection test proves."""
    definition = get_provider_definition(credential.provider)
    payload = "\x1f".join(
        (
            credential.provider.value,
            str(credential.config_revision),
            credential.model,
            effective_base_url(credential).rstrip("/"),
            *definition.verification_contract(credential.model),
        )
    )
    return sha256(payload.encode("utf-8")).hexdigest()


def is_verified(credential: LLMCredential) -> bool:
    """Whether the stored evidence still matches the current configuration."""
    return bool(
        credential.model
        and credential.verified_at is not None
        and credential.verified_revision == credential.config_revision
        and credential.verified_fingerprint == verification_fingerprint(credential)
    )
