"""Robust parsing of JSON emitted by an LLM.

LLMs frequently wrap JSON in Markdown fences or add prose around it. This module
extracts and repairs the payload, raising a clear :class:`LLMError` when it truly
cannot recover.
"""

from __future__ import annotations

import json
import re

from app.core.exceptions import LLMError

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)
_TRAILING_COMMA_RE = re.compile(r",(\s*[}\]])")


def parse_llm_json(raw_text: str) -> dict:
    """Parse a JSON object out of ``raw_text``.

    Handles Markdown code fences and a single repair pass for common issues
    (trailing commas, leading/trailing prose). Raises ``LLMError`` on failure.
    """
    if not raw_text or not raw_text.strip():
        raise LLMError("El proveedor de IA no devolvió contenido utilizable.", code="LLM_INVALID_RESPONSE")

    candidate = _extract_candidate(raw_text)

    try:
        return _loads_object(candidate)
    except (json.JSONDecodeError, LLMError):
        repaired = _TRAILING_COMMA_RE.sub(r"\1", candidate)
        try:
            return _loads_object(repaired)
        except json.JSONDecodeError:
            pass
    raise LLMError("El proveedor de IA devolvió una respuesta inválida.", code="LLM_INVALID_RESPONSE")


def _extract_candidate(raw_text: str) -> str:
    fenced = _FENCE_RE.search(raw_text)
    if fenced:
        return fenced.group(1).strip()

    # No fence: slice from the first '{' to the last '}'.
    start = raw_text.find("{")
    end = raw_text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return raw_text[start : end + 1].strip()
    return raw_text.strip()


def _loads_object(text: str) -> dict:
    data = json.loads(text)
    if not isinstance(data, dict):
        raise LLMError("El proveedor de IA devolvió una respuesta inválida.", code="LLM_INVALID_RESPONSE")
    return data
