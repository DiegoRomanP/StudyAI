"""Output budgets per call kind and the single retry on LLM_OUTPUT_LIMIT."""

from __future__ import annotations

import pytest

from app.core.exceptions import LLMError
from app.llm.base import LLMProvider
from app.llm.output_budget import MAX_OUTPUT_BUDGET, OUTPUT_BUDGETS, complete_within_budget


class _Recorder(LLMProvider):
    """Raises the scripted errors in order, then answers; records (kind, max_tokens)."""

    def __init__(self, *errors: Exception) -> None:
        self.errors = list(errors)
        self.calls: list[tuple[str, int]] = []

    def complete(self, *, kind, system, prompt, context=None, max_tokens=4096):
        self.calls.append((kind, max_tokens))
        if self.errors:
            raise self.errors.pop(0)
        return "{}"


def _output_limit() -> LLMError:
    return LLMError("sin espacio", code="LLM_OUTPUT_LIMIT")


def _call(llm: LLMProvider, kind: str = "session_content", **kwargs) -> str:
    return complete_within_budget(llm, kind=kind, system="s", prompt="p", **kwargs)


@pytest.mark.parametrize("kind", sorted(OUTPUT_BUDGETS))
def test_first_attempt_uses_the_kind_budget(kind):
    llm = _Recorder()

    assert _call(llm, kind) == "{}"
    assert llm.calls == [(kind, OUTPUT_BUDGETS[kind])]


def test_output_limit_retries_once_with_double_budget_and_paces():
    llm = _Recorder(_output_limit())
    paced: list[bool] = []

    assert _call(llm, "topic_analysis", before_retry=lambda: paced.append(True)) == "{}"
    assert llm.calls == [("topic_analysis", 2048), ("topic_analysis", 4096)]
    assert paced == [True]


def test_retry_is_capped_at_8192(monkeypatch):
    monkeypatch.setitem(OUTPUT_BUDGETS, "session_content", 6000)
    llm = _Recorder(_output_limit())

    _call(llm)

    assert llm.calls[-1] == ("session_content", MAX_OUTPUT_BUDGET)


def test_a_second_output_limit_propagates():
    llm = _Recorder(_output_limit(), _output_limit())

    with pytest.raises(LLMError) as raised:
        _call(llm)

    assert raised.value.code == "LLM_OUTPUT_LIMIT"
    assert llm.calls == [("session_content", 4096), ("session_content", 8192)]


def test_no_retry_when_escalate_is_false():
    llm = _Recorder(_output_limit())

    with pytest.raises(LLMError):
        _call(llm, "session_plan", escalate=False)

    assert llm.calls == [("session_plan", 1024)]


def test_other_errors_are_not_retried():
    llm = _Recorder(LLMError("cuota", code="LLM_QUOTA_EXHAUSTED"))
    paced: list[bool] = []

    with pytest.raises(LLMError):
        _call(llm, before_retry=lambda: paced.append(True))

    assert len(llm.calls) == 1
    assert paced == []
