"""Curated NVIDIA NIM models that are compatible with StudyAI generation.

NVIDIA's public model list also includes classifiers, safety guards and entity
extractors. Presence in that list is not enough to make a model suitable for
StudyAI's structured plan-generation workflow, so this registry is deliberately
small and source-controlled.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from types import MappingProxyType
from typing import Mapping

from app.llm.request_profiles import RequestProfile

NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_NVCF_STATUS_URL = "https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/{request_id}"
NVIDIA_ADAPTER_VERSION = "v1"
NVIDIA_NEMOTRON_REASONING_BUDGET_TOKENS = 256
NVIDIA_STANDARD_CHAT_PROFILE = RequestProfile(
    identifier="nvidia-standard-chat",
    version="v1",
    token_limit_parameter="max_tokens",
    test_max_tokens=32,
)


class NvidiaMessageMode(StrEnum):
    SYSTEM_USER = "SYSTEM_USER"
    USER_ONLY = "USER_ONLY"


@dataclass(frozen=True)
class NvidiaModelSpec:
    """One NVIDIA model contract that StudyAI can safely generate with."""

    model_id: str
    contract_id: str
    contract_version: str
    message_mode: NvidiaMessageMode
    max_output_tokens: int
    request_profile: RequestProfile
    docs_url: str
    static_parameters: Mapping[str, object] = field(
        default_factory=lambda: MappingProxyType({})
    )

    @property
    def verification_version(self) -> str:
        return f"{NVIDIA_ADAPTER_VERSION}:{self.contract_id}:{self.contract_version}"


_SPECS = (
    NvidiaModelSpec(
        model_id="nvidia/nemotron-3-super-120b-a12b",
        contract_id="nvidia-reasoning-chat",
        contract_version="v2",
        message_mode=NvidiaMessageMode.SYSTEM_USER,
        max_output_tokens=32768,
        request_profile=NVIDIA_STANDARD_CHAT_PROFILE,
        docs_url="https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b-infer",
        static_parameters=MappingProxyType(
            {
                "reasoning_effort": "low",
                "reasoning_budget": NVIDIA_NEMOTRON_REASONING_BUDGET_TOKENS,
            }
        ),
    ),
)

NVIDIA_MODEL_SPECS: Mapping[str, NvidiaModelSpec] = MappingProxyType(
    {spec.model_id: spec for spec in _SPECS}
)


def get_nvidia_model_spec(model_id: str) -> NvidiaModelSpec | None:
    """Return a supported model specification without normalizing its ID."""
    return NVIDIA_MODEL_SPECS.get(model_id)


def nvidia_verification_version(model_id: str) -> str:
    """Stable fingerprint component, including unsupported historical models."""
    spec = get_nvidia_model_spec(model_id)
    return spec.verification_version if spec is not None else f"{NVIDIA_ADAPTER_VERSION}:unsupported"
