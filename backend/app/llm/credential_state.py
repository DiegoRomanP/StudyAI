"""Derived state for a stored LLM credential.

The verification fingerprint intentionally contains configuration metadata only;
the API key is never used as fingerprint input or returned to callers.
"""

from __future__ import annotations

from hashlib import sha256

from app.core.config import get_settings
from app.llm.providers_catalog import PROVIDER_CATALOG
from app.models.llm_credential import LLMCredential, LLMProviderName

_REQUEST_PROFILE_VERSION = "v1"


def effective_base_url(credential: LLMCredential) -> str:
    """Return the exact base URL used when building this credential's provider."""
    if credential.provider == LLMProviderName.OLLAMA:
        return f"{get_settings().OLLAMA_BASE_URL.rstrip('/')}/v1"
    return credential.base_url or PROVIDER_CATALOG[credential.provider].default_base_url or ""


def verification_fingerprint(credential: LLMCredential) -> str:
    """Hash the configuration that a successful connection test proves."""
    payload = "\x1f".join(
        (
            credential.provider.value,
            str(credential.config_revision),
            credential.model,
            effective_base_url(credential).rstrip("/"),
            _REQUEST_PROFILE_VERSION,
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
