from __future__ import annotations

import pytest
from pydantic import TypeAdapter, ValidationError

from app.pedagogy.contracts import StoredAssessmentQuestion
from app.schemas.adaptive_learning import (
    AssessmentAnswerV2,
    AssessmentResponseV2,
    AssessmentResultV2,
    FormativeFeedbackV2,
)

_ANSWER_ADAPTER = TypeAdapter(AssessmentAnswerV2)


def _criteria() -> list[dict]:
    return [
        {
            "criterion_id": "evidence",
            "description": "Support your response with evidence.",
            "descriptors": ["No evidence", "Some evidence", "Clear evidence"],
        },
        {
            "criterion_id": "clarity",
            "description": "Explain your reasoning clearly.",
            "descriptors": ["Unclear", "Mostly clear", "Clear"],
        },
    ]


def _question(
    kind: str,
    *,
    grading_mode: str | None = None,
    expected_answer: str | list[str] | None = None,
    rubric_criteria: list[dict] | None = None,
) -> dict:
    question = {
        "question_id": f"adaptive:{kind}-1",
        "kind": kind,
        "prompt": "Explain the evidence for your answer.",
        "objective_ids": ["objective-1"],
    }
    if grading_mode is not None:
        question["grading_mode"] = grading_mode
    if expected_answer is not None:
        question["expected_answer"] = expected_answer
    if rubric_criteria is not None:
        question["rubric_criteria"] = rubric_criteria
    return question


@pytest.mark.parametrize("expected_answer", [["Factual claim"], ["Claim A", "Claim B"]])
def test_short_answer_exact_accepts_single_or_multiple_private_keys(expected_answer: list[str]):
    question = StoredAssessmentQuestion.model_validate(
        _question("short_answer", grading_mode="exact", expected_answer=expected_answer)
    )

    assert question.grading_mode == "exact"
    assert question.expected_answer == expected_answer
    assert question.rubric_criteria == []


@pytest.mark.parametrize(
    "keys",
    [
        [],
        [" ", "Answer"],
        ["A" * 2001],
        ["Ａnswer", "Answer"],
        ["  two  words", "two words"],
    ],
)
def test_short_answer_exact_rejects_empty_long_and_normalized_duplicate_keys(keys: list[str]):
    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(
            _question("short_answer", grading_mode="exact", expected_answer=keys)
        )


def test_short_answer_exact_requires_a_list_with_at_most_sixteen_keys():
    valid_keys = [f"answer {index}" for index in range(16)]
    question = StoredAssessmentQuestion.model_validate(
        _question("short_answer", grading_mode="exact", expected_answer=valid_keys)
    )
    assert len(question.expected_answer) == 16

    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(
            _question("short_answer", grading_mode="exact", expected_answer=valid_keys + ["extra"])
        )


@pytest.mark.parametrize("mode", ["exact", "numeric", "unknown", None])
def test_short_answer_rejects_non_formative_modes_without_a_key(mode: str | None):
    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(
            _question("short_answer", grading_mode=mode, expected_answer=None)
        )


def test_short_answer_formative_requires_a_rubric_and_rejects_an_objective_key():
    question = StoredAssessmentQuestion.model_validate(
        _question("short_answer", grading_mode="formative", rubric_criteria=_criteria())
    )
    assert question.expected_answer is None
    assert len(question.rubric_criteria) == 2

    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(
            _question(
                "short_answer",
                grading_mode="formative",
                expected_answer=["private key"],
                rubric_criteria=_criteria(),
            )
        )

    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(
            _question("short_answer", grading_mode="formative")
        )


@pytest.mark.parametrize(
    "criteria",
    [
        [],
        [_criteria()[0], _criteria()[0]],
        [dict(_criteria()[0], descriptors=[])],
        [dict(_criteria()[0], descriptors=[" "])],
    ],
)
def test_formative_text_rejects_missing_duplicate_or_empty_rubric_criteria(criteria: list[dict]):
    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(
            _question("essay", rubric_criteria=criteria)
        )


def test_essay_is_formative_only_and_preserves_its_rubric():
    question = StoredAssessmentQuestion.model_validate(
        _question("essay", rubric_criteria=_criteria())
    )
    answer = _ANSWER_ADAPTER.validate_python(
        {"kind": "essay", "question_id": question.question_id, "text": "  My response.  "}
    )

    assert question.grading_mode is None
    assert question.expected_answer is None
    assert answer.text == "  My response.  "

    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(
            _question("essay", grading_mode="exact", rubric_criteria=_criteria())
        )

    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(
            _question("essay", expected_answer="secret key", rubric_criteria=_criteria())
        )


@pytest.mark.parametrize("mode", ["exact", "numeric"])
def test_step_by_step_objective_final_answer_still_requires_procedure_rubric(mode: str):
    expected_answer = ["3/4"] if mode == "exact" else "0,75"
    question = StoredAssessmentQuestion.model_validate(
        _question(
            "step_by_step",
            grading_mode=mode,
            expected_answer=expected_answer,
            rubric_criteria=_criteria(),
        )
    )

    assert question.grading_mode == mode
    assert question.expected_answer == expected_answer
    assert len(question.rubric_criteria) == 2

    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(
            _question("step_by_step", grading_mode=mode, expected_answer=expected_answer)
        )


@pytest.mark.parametrize("expected_answer", ["1/0", "2+2", "1e3", "3 kg", "9" * 65])
def test_step_by_step_numeric_mode_validates_its_private_key_with_shared_parser(
    expected_answer: str,
):
    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(
            _question(
                "step_by_step",
                grading_mode="numeric",
                expected_answer=expected_answer,
                rubric_criteria=_criteria(),
            )
        )


def test_step_by_step_exact_accepts_multiple_bounded_keys_and_formative_has_no_key():
    objective = StoredAssessmentQuestion.model_validate(
        _question(
            "step_by_step",
            grading_mode="exact",
            expected_answer=[" 3/4 ", "three quarters"],
            rubric_criteria=_criteria(),
        )
    )
    formative = StoredAssessmentQuestion.model_validate(
        _question("step_by_step", grading_mode="formative", rubric_criteria=_criteria())
    )
    assert objective.expected_answer == [" 3/4 ", "three quarters"]
    assert formative.expected_answer is None

    for key in ("3/4", [" 3/4 ", "3/4"], [" "], ["x" * 2001]):
        with pytest.raises(ValidationError):
            StoredAssessmentQuestion.model_validate(
                _question(
                    "step_by_step",
                    grading_mode="exact",
                    expected_answer=key,
                    rubric_criteria=_criteria(),
                )
            )


def test_step_by_step_answer_preserves_steps_and_requires_nonblank_bounded_final():
    answer = _ANSWER_ADAPTER.validate_python(
        {
            "kind": "step_by_step",
            "question_id": "q1",
            "steps": "  First line.\nSecond line.  ",
            "final_answer": " 3/4 ",
        }
    )
    assert answer.steps == "  First line.\nSecond line.  "
    assert answer.final_answer == " 3/4 "

    for final_answer in ("", "  \n ", "x" * 2001):
        with pytest.raises(ValidationError):
            _ANSWER_ADAPTER.validate_python(
                {
                    "kind": "step_by_step",
                    "question_id": "q1",
                    "steps": "",
                    "final_answer": final_answer,
                }
            )


@pytest.mark.parametrize("kind", ["short_answer", "essay"])
@pytest.mark.parametrize("text", ["", "  \n \t", "x" * 2001])
def test_text_answers_require_nonblank_text_within_two_thousand_characters(
    kind: str, text: str
):
    with pytest.raises(ValidationError):
        _ANSWER_ADAPTER.validate_python(
            {"kind": kind, "question_id": "q1", "text": text}
        )


def test_short_answer_essay_and_step_payloads_do_not_accept_ratings_before_submission():
    for answer in (
        {"kind": "short_answer", "question_id": "q1", "text": "Answer", "criterion_ratings": {}},
        {"kind": "essay", "question_id": "q1", "text": "Answer", "criterion_ratings": {}},
        {
            "kind": "step_by_step",
            "question_id": "q1",
            "steps": "work",
            "final_answer": "42",
            "criterion_ratings": {},
        },
    ):
        with pytest.raises(ValidationError):
            _ANSWER_ADAPTER.validate_python(answer)


def test_public_text_dtos_exclude_private_keys_and_formative_rubrics():
    response = AssessmentResponseV2.model_validate(
        {
            "quiz_id": 4,
            "revision": "revision-1",
            "questions": [
                {
                    "question_id": "short-answer",
                    "kind": "short_answer",
                    "prompt": "Give the exact term.",
                    "objective_ids": ["objective-1"],
                    "grading_mode": "exact",
                },
                {
                    "question_id": "essay",
                    "kind": "essay",
                    "prompt": "Explain your reasoning.",
                    "objective_ids": ["objective-1"],
                },
                {
                    "question_id": "step-by-step",
                    "kind": "step_by_step",
                    "prompt": "Show the calculation.",
                    "objective_ids": ["objective-1"],
                    "grading_mode": "numeric",
                    "estimated_minutes_per_question": {"min": 3, "max": 5},
                },
            ],
        }
    )

    rendered = str(response.model_dump(mode="json"))
    assert "expected_answer" not in rendered
    assert "rubric_criteria" not in rendered
    assert "exemplar" not in rendered

    for field in ("procedure_rubric_weights", "submitted_text"):
        with pytest.raises(ValidationError):
            AssessmentResponseV2.model_validate(
                {
                    "quiz_id": 4,
                    "revision": "revision-1",
                    "questions": [
                        {
                            "question_id": "short-answer",
                            "kind": "short_answer",
                            "prompt": "Question.",
                            "objective_ids": ["objective-1"],
                            field: "wrong-location",
                        }
                    ],
                }
            )


def test_formative_result_echoes_submitted_text_without_changing_legacy_ratings():
    legacy_rubric = FormativeFeedbackV2.model_validate(
        {
            "question_id": "legacy-rubric",
            "criterion_ratings": {"evidence": 2},
            "criteria": _criteria(),
            "exemplar": "A sample argument.",
            "message": "Compare your response with each criterion.",
        }
    )
    formative = FormativeFeedbackV2.model_validate(
        {
            "question_id": "essay",
            "submitted_text": "  My response.  ",
            "message": "Review the rubric.",
            "criteria": _criteria(),
        }
    )

    assert legacy_rubric.criterion_ratings == {"evidence": 2}
    assert formative.criterion_ratings == {}
    assert formative.submitted_text == "  My response.  "


def test_objective_result_breakdown_is_typed_and_cannot_exceed_its_question_total():
    result = AssessmentResultV2.model_validate(
        {
            "quiz_id": 7,
            "revision": "revision-1",
            "score": 50,
            "correct": 1,
            "total": 2,
            "detail": [],
            "objective_results": [{"objective_id": "objective-1", "correct": 1, "total": 2}],
        }
    )

    assert result.objective_results[0].objective_id == "objective-1"
    assert result.objective_results[0].correct == 1

    for totals in (
        {"objective_id": "objective-1", "correct": 2, "total": 1},
        {"objective_id": "objective-1", "correct": 0, "total": 0},
    ):
        with pytest.raises(ValidationError):
            AssessmentResultV2.model_validate(
                {
                    "quiz_id": 7,
                    "revision": "revision-1",
                    "score": 0,
                    "correct": 0,
                    "total": 1,
                    "detail": [],
                    "objective_results": [totals],
                }
            )
