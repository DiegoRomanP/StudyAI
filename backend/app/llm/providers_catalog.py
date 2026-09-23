"""Compatibility view of the provider-owned settings catalog.

Provider metadata belongs beside each vendor contract in ``app.llm.providers``.
This module remains the API-facing import point while callers migrate to the
registry, ensuring the frontend continues to receive one complete catalog.
"""

from app.llm.provider_registry import provider_catalog
from app.llm.providers.base import ModelOption, ProviderMeta

PROVIDER_CATALOG = provider_catalog()

__all__ = ["ModelOption", "ProviderMeta", "PROVIDER_CATALOG"]
