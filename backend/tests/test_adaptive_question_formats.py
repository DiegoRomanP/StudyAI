from __future__ import annotations

from unittest.mock import patch

import pytest
from pydantic import TypeAdapter, ValidationError

from app.pedagogy.contracts import (
    AdaptiveAssessmentPayload,
    AdaptiveSessionDraft,
    StoredAssessmentQuestion,
)
from app.pedagogy.registry import resolve_profile, snapshot_profile
from app.schemas.adaptive_learning import (
    AssessmentAnswerV2,
    AssessmentResponseV2,
)

_ANSWER_ADAPTER = TypeAdapter(AssessmentAnswerV2)


def _multiple_choice_question(mode: str, expected_answer: str | list[str]) -> dict:
    return {
        "question_id": "adaptive:choice-1",
        "kind": "multiple_choice",
        "prompt": "Select the correct option.",
        "objective_ids": ["objective-1"],
        "mode": mode,
        "options": ["A", "B", "C", "D"],
        "expected_answer": expected_answer,
    }


def _matching_question(item_count: int = 2) -> dict:
    return {
        "question_id": "adaptive:matching-1",
        "kind": "matching",
        "prompt": "Match each term with its definition.",
        "objective_ids": ["objective-1"],
        "matching_left": [
            {"id": f"term-{index}", "text": f"Term {index}"}
            for index in range(item_count)
        ],
        "matching_right": [
            {"id": f"meaning-{index}", "text": f"Meaning {index}"}
            for index in range(item_count)
        ],
        "matching_pairs": [
            {"left_id": f"term-{index}", "right_id": f"meaning-{index}"}
            for index in range(item_count)
        ],
    }


def _true_false_question(answer: bool) -> dict:
    return {
        "question_id": "adaptive:true-false-1",
        "kind": "true_false",
        "prompt": "The statement is correct.",
        "objective_ids": ["objective-1"],
        "expected_answer": answer,
    }


def _reverse_shuffle(shuffle_calls: list[int], items: list) -> None:
    shuffle_calls.append(1)
    items.reverse()


@pytest.mark.parametrize(
    ("mode", "expected_answer", "answer"),
    [
        ("single", "B", {"kind": "multiple_choice", "question_id": "q1", "selected_option": "B"}),
        (
            "multiple",
            ["B", "D"],
            {
                "kind": "multiple_choice",
                "question_id": "q1",
                "selected_options": ["B", "D"],
            },
        ),
    ],
)
def test_multiple_choice_contracts_keep_single_and_multiple_payloads_distinct(
    mode: str, expected_answer: str | list[str], answer: dict
):
    question = StoredAssessmentQuestion.model_validate(
        _multiple_choice_question(mode, expected_answer)
    )

    validated_answer = _ANSWER_ADAPTER.validate_python(answer)

    assert question.mode == mode
    assert validated_answer.question_id == "q1"
    assert question.expected_answer == expected_answer


@pytest.mark.parametrize(
    "changes",
    [
        {"options": ["A", "A", "C", "D"]},
        {"options": ["A", "B", "C"]},
        {"expected_answer": "Z"},
        {"expected_answer": ["A", "A"]},
        {"mode": "multiple", "expected_answer": ["A"]},
        {
            "mode": "multiple",
            "options": ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
            "expected_answer": ["A", "B"],
        },
        {"mode": "single", "expected_answer": ["A", "B"]},
    ],
)
def test_multiple_choice_rejects_invalid_options_and_keys(changes: dict):
    raw_question = _multiple_choice_question("single", "A")
    raw_question.update(changes)

    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(raw_question)


@pytest.mark.parametrize(
    "answer",
    [
        {"kind": "multiple_choice", "question_id": "q1", "selected_option": "A", "selected_options": ["A"]},
        {"kind": "multiple_choice", "question_id": "q1", "selected_options": []},
        {"kind": "multiple_choice", "question_id": "q1", "selected_options": ["A", "A"]},
    ],
)
def test_multiple_choice_answers_reject_ambiguous_or_empty_selections(answer: dict):
    with pytest.raises(ValidationError):
        _ANSWER_ADAPTER.validate_python(answer)


@pytest.mark.parametrize("answer", [True, False])
def test_true_false_uses_strict_boolean_answers(answer: bool):
    question = StoredAssessmentQuestion.model_validate(_true_false_question(answer))
    validated_answer = _ANSWER_ADAPTER.validate_python(
        {"kind": "true_false", "question_id": "q1", "answer": answer}
    )

    assert question.expected_answer is answer
    assert validated_answer.answer is answer


@pytest.mark.parametrize("answer", ["true", "false", 1, 0, None])
def test_true_false_rejects_non_boolean_storage_and_answers(answer):
    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(_true_false_question(answer))

    with pytest.raises(ValidationError):
        _ANSWER_ADAPTER.validate_python(
            {"kind": "true_false", "question_id": "q1", "answer": answer}
        )


def test_matching_shuffles_only_the_displayed_right_items_once():
    source = _matching_question()
    original_right = [item["id"] for item in source["matching_right"]]
    reversed_right_ids = list(reversed(original_right))

    with patch("app.pedagogy.contracts.SystemRandom.shuffle", lambda _random, items: items.reverse()):
        question = StoredAssessmentQuestion.model_validate(source)

    assert [item.id for item in question.matching_right] == reversed_right_ids
    assert [item.id for item in question.matching_left] == ["term-0", "term-1"]
    assert question.matching_pairs[0].right_id == "meaning-0"
    assert [item.id for item in question.matching_right] != original_right
    assert question.matching_presentation_initialized is True


def test_matching_display_permutation_is_independent_of_the_private_key():
    pair_orders = [
        [
            {"left_id": "term-0", "right_id": "meaning-0"},
            {"left_id": "term-1", "right_id": "meaning-1"},
        ],
        [
            {"left_id": "term-0", "right_id": "meaning-1"},
            {"left_id": "term-1", "right_id": "meaning-0"},
        ],
    ]
    presentations = []

    with patch("app.pedagogy.contracts.SystemRandom.shuffle", lambda _random, items: items.reverse()):
        for pair_order in pair_orders:
            question = _matching_question()
            question["matching_pairs"] = pair_order
            stored = StoredAssessmentQuestion.model_validate(question)
            presentations.append([item.id for item in stored.matching_right])

    assert presentations[0] == presentations[1]


def test_matching_presentation_survives_payload_and_fresh_validation():
    shuffle_calls = []

    with patch(
        "app.pedagogy.contracts.SystemRandom.shuffle",
        lambda _random, items: _reverse_shuffle(shuffle_calls, items),
    ):
        question = StoredAssessmentQuestion.model_validate(_matching_question())
        stored_payload = AdaptiveAssessmentPayload(
            schema_version=2,
            question_objectives={question.question_id: question.objective_ids},
            questions=[question],
        ).model_dump(mode="json")
        presentation_before = [
            item["id"] for item in stored_payload["questions"][0]["matching_right"]
        ]
        snapshot = snapshot_profile(resolve_profile("general", None), [])
        reloaded_draft = AdaptiveSessionDraft.from_storage(
            {
                "pedagogy_snapshot": snapshot.model_dump(mode="json"),
                "lesson_blocks": [],
                "adaptive_assessment": stored_payload,
                "assessment_revision": "revision-1",
                "assessment_state": "open",
            }
        )

    assert [
        item.id for item in reloaded_draft.adaptive_assessment.questions[0].matching_right
    ] == presentation_before
    assert shuffle_calls == [1]


@pytest.mark.parametrize(
    "changes",
    [
        {"matching_left": [{"id": "term-0", "text": "Term 0"}]},
        {"matching_left": [{"id": "term-0", "text": "Term 0"}, {"id": "term-0", "text": "Duplicate"}]},
        {"matching_right": [{"id": "meaning-0", "text": "Meaning 0"}, {"id": "meaning-0", "text": "Duplicate"}]},
        {"matching_pairs": [{"left_id": "term-0", "right_id": "meaning-0"}]},
        {
            "matching_pairs": [
                {"left_id": "term-0", "right_id": "meaning-0"},
                {"left_id": "term-1", "right_id": "meaning-0"},
            ]
        },
        {
            "matching_pairs": [
                {"left_id": "term-0", "right_id": "missing"},
                {"left_id": "term-1", "right_id": "meaning-1"},
            ]
        },
    ],
)
def test_matching_requires_two_through_eight_unique_complete_pairs(changes: dict):
    question = _matching_question()
    question.update(changes)

    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(question)


def test_matching_accepts_eight_pairs_and_rejects_nine():
    assert len(StoredAssessmentQuestion.model_validate(_matching_question(8)).matching_pairs) == 8

    with pytest.raises(ValidationError):
        StoredAssessmentQuestion.model_validate(_matching_question(9))


def test_matching_submission_requires_a_complete_unique_bijection():
    valid_answer = {
        "kind": "matching",
        "question_id": "q1",
        "pairs": [
            {"left_id": "term-a", "right_id": "meaning-b"},
            {"left_id": "term-b", "right_id": "meaning-a"},
        ],
    }

    parsed_answer = _ANSWER_ADAPTER.validate_python(valid_answer)

    assert len(parsed_answer.pairs) == 2
    for pairs in (
        [{"left_id": "term-a", "right_id": "meaning-a"}],
        [
            {"left_id": "term-a", "right_id": "meaning-a"},
            {"left_id": "term-a", "right_id": "meaning-b"},
        ],
        [
            {"left_id": "term-a", "right_id": "meaning-a"},
            {"left_id": "term-b", "right_id": "meaning-a"},
        ],
    ):
        with pytest.raises(ValidationError):
            _ANSWER_ADAPTER.validate_python(
                {"kind": "matching", "question_id": "q1", "pairs": pairs}
            )


@pytest.mark.parametrize("marker", [False, True])
def test_raw_generator_input_cannot_set_matching_presentation_marker(marker: bool):
    question = _matching_question()
    question["matching_presentation_initialized"] = marker

    with pytest.raises(ValidationError, match="storage-only"):
        StoredAssessmentQuestion.model_validate(question)


def test_public_assessment_dtos_do_not_expose_private_keys_or_presentation_markers():
    questions = [
        {
            "question_id": "choice-1",
            "kind": "multiple_choice",
            "mode": "multiple",
            "prompt": "Select all correct answers.",
            "objective_ids": ["objective-1"],
            "options": ["A", "B", "C", "D"],
            "estimated_minutes_per_question": {"min": 5, "max": 10},
        },
        {
            "question_id": "tf-1",
            "kind": "true_false",
            "prompt": "Is this true?",
            "objective_ids": ["objective-1"],
        },
        {
            "question_id": "matching-1",
            "kind": "matching",
            "prompt": "Match the pairs.",
            "objective_ids": ["objective-1"],
            "matching_left": [{"id": "left-1", "text": "Left"}, {"id": "left-2", "text": "Other"}],
            "matching_right": [{"id": "right-1", "text": "Right"}, {"id": "right-2", "text": "Other"}],
        },
    ]
    public_response = AssessmentResponseV2.model_validate(
        {"quiz_id": 1, "revision": "r1", "questions": questions}
    )
    rendered = public_response.model_dump(mode="json")
    rendered_json = str(rendered)

    assert "expected_answer" not in rendered_json
    assert "matching_pairs" not in rendered_json
    assert "presentation_initialized" not in rendered_json
    assert "estimated_minutes_per_question" in rendered["questions"][0]


def test_existing_legacy_v2_question_and_answer_shapes_still_validate():
    legacy_question = StoredAssessmentQuestion.model_validate(
        {
            "question_id": "legacy:numeric",
            "kind": "numeric",
            "prompt": "What is one half?",
            "objective_ids": ["objective-1"],
            "expected_answer": "1/2",
            "units": None,
        }
    )
    legacy_answer = _ANSWER_ADAPTER.validate_python(
        {"kind": "numeric", "question_id": "legacy:numeric", "value": "1/2"}
    )

    assert legacy_question.expected_answer == "1/2"
    assert legacy_answer.value == "1/2"
