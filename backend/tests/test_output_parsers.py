"""Unit tests for the safe LLM JSON parser."""

import pytest

from app.core.exceptions import LLMError
from app.llm.output_parsers import parse_llm_json


def test_parses_clean_json():
    assert parse_llm_json('{"a": 1, "b": "x"}') == {"a": 1, "b": "x"}


def test_strips_markdown_fences():
    raw = 'Claro, aquí tienes:\n```json\n{"topics": [1, 2]}\n```\n¡Listo!'
    assert parse_llm_json(raw) == {"topics": [1, 2]}


def test_repairs_trailing_commas():
    assert parse_llm_json('{"a": [1, 2,], "b": 3,}') == {"a": [1, 2], "b": 3}


def test_raises_on_unrecoverable_output():
    with pytest.raises(LLMError):
        parse_llm_json("esto no es json en absoluto")


def test_raises_on_empty():
    with pytest.raises(LLMError):
        parse_llm_json("")
