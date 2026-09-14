"""LLM JSON parser never chains the raw model output into safe failures."""

import traceback

import pytest

from app.core.exceptions import LLMError
from app.llm.output_parsers import parse_llm_json


def test_invalid_json_does_not_retain_the_model_output_in_exception_context():
    secret = "secret-document-prompt"

    with pytest.raises(LLMError) as exc_info:
        parse_llm_json(f'{{"content": "{secret}"')

    error = exc_info.value
    assert error.code == "LLM_INVALID_RESPONSE"
    assert error.__cause__ is None
    assert error.__context__ is None
    assert secret not in "".join(traceback.format_exception(error))
