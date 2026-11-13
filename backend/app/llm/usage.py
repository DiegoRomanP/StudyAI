"""Token usage reported by an LLM provider for one response."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class LLMUsage:
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    cached_input_tokens: int = 0


def as_count(value: object) -> int:
    """A non-negative int from a provider field; anything else counts as 0."""
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def field(source: object, name: str) -> object:
    return source.get(name) if isinstance(source, Mapping) else getattr(source, name, None)
