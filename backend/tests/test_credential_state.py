"""Verification evidence must track the exact request profile in use."""

from dataclasses import replace
from datetime import UTC, datetime

from app.llm.credential_state import is_verified, verification_fingerprint
from app.llm.providers.openai import OPENAI_O_SERIES_PROFILE
from app.models.llm_credential import LLMCredential, LLMProviderName


def test_request_profile_version_change_invalidates_verification(monkeypatch):
    credential = LLMCredential(
        user_id=1,
        provider=LLMProviderName.OPENAI,
        encrypted_api_key="unused",
        model="o4-mini",
        config_revision=1,
        verified_revision=1,
        verified_at=datetime.now(UTC),
    )
    credential.verified_fingerprint = verification_fingerprint(credential)

    assert is_verified(credential) is True

    monkeypatch.setattr(
        "app.llm.providers.openai.OPENAI_O_SERIES_PROFILE",
        replace(OPENAI_O_SERIES_PROFILE, version="v3"),
    )

    assert is_verified(credential) is False


def test_nvidia_contract_version_change_invalidates_verification(monkeypatch):
    credential = LLMCredential(
        user_id=1,
        provider=LLMProviderName.NVIDIA,
        encrypted_api_key="unused",
        model="meta/llama-3.3-70b-instruct",
        config_revision=1,
        verified_revision=1,
        verified_at=datetime.now(UTC),
    )
    credential.verified_fingerprint = verification_fingerprint(credential)

    assert is_verified(credential) is True

    monkeypatch.setattr(
        "app.llm.providers.nvidia.nvidia_verification_version",
        lambda _model: "v2:nvidia-chat:v2",
    )

    assert is_verified(credential) is False
