import pytest
from pydantic import TypeAdapter

from app.core.exceptions import ValidationError
from app.pedagogy.contracts import ObjectiveGrade, StoredAssessmentQuestion
from app.schemas.adaptive_learning import AssessmentAnswerV2
from app.services.assessment_graders import grade_objective_answer, summarize_objective_grades


ANSWER = TypeAdapter(AssessmentAnswerV2)


def grade(kind, question, answer):
    stored = StoredAssessmentQuestion(
        question_id="adaptive:item", prompt="Explica el tema.", objective_ids=["main"],
        kind=kind, **question,
    )
    submission = ANSWER.validate_python({"question_id": "adaptive:item", "kind": kind, **answer})
    return grade_objective_answer(stored, submission)


@pytest.mark.parametrize(
    ("answer", "correct"),
    [("A", True), ("B", False)],
)
def test_single_choice_grades_only_an_existing_option(answer, correct):
    assert grade(
        "multiple_choice", {"options": ["A", "B", "C", "D"], "expected_answer": "A"},
        {"selected_option": answer},
    ).correct is correct


@pytest.mark.parametrize(
    ("answer", "correct"),
    [(["D", "A"], True), (["A"], False), (["D", "A", "B"], False)],
)
def test_multi_select_is_exact_and_order_independent(answer, correct):
    assert grade(
        "multiple_choice", {"mode": "multiple", "options": ["A", "B", "C", "D"], "expected_answer": ["A", "D"]},
        {"selected_options": answer},
    ).correct is correct


@pytest.mark.parametrize("answer", [{"selected_option": "unknown"}, {"selected_options": ["A"]}])
def test_single_choice_rejects_unknown_options_and_multi_payload(answer):
    with pytest.raises(ValidationError):
        grade("multiple_choice", {"options": ["A", "B", "C", "D"], "expected_answer": "A"}, answer)


def test_true_false_and_numeric_use_exact_comparison():
    assert grade("true_false", {"expected_answer": False}, {"answer": False}).correct is True
    assert grade("true_false", {"expected_answer": False}, {"answer": True}).correct is False
    assert grade("numeric", {"expected_answer": "3/4"}, {"value": "0,75"}).correct is True
    assert grade("numeric", {"expected_answer": "3/4"}, {"value": "0.7"}).correct is False
    with pytest.raises(ValidationError):
        grade("numeric", {"expected_answer": "3/4"}, {"value": "1e3"})


def test_sequence_distinguishes_an_incorrect_order_from_an_incomplete_set():
    question = {
        "expected_answer": ["a", "b"],
        "sequence_items": [{"id": "a", "text": "Primero"}, {"id": "b", "text": "Después"}],
    }
    assert grade("sequence", question, {"ordered_ids": ["a", "b"]}).correct is True
    assert grade("sequence", question, {"ordered_ids": ["b", "a"]}).correct is False
    for ordered_ids in (["a"], ["b", "b"], ["b", "unknown"]):
        with pytest.raises(ValidationError):
            grade("sequence", question, {"ordered_ids": ordered_ids})


def test_matching_distinguishes_an_incorrect_bijection_from_an_unknown_id():
    exact = [{"left_id": "a", "right_id": "r1"}, {"left_id": "b", "right_id": "r2"}]
    question = {
        "matching_pairs": exact,
        "matching_left": [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}],
        "matching_right": [{"id": "r1", "text": "Uno"}, {"id": "r2", "text": "Dos"}],
    }
    assert grade("matching", question, {"pairs": list(reversed(exact))}).correct is True
    assert grade("matching", question, {"pairs": [
        {"left_id": "a", "right_id": "r2"}, {"left_id": "b", "right_id": "r1"},
    ]}).correct is False
    with pytest.raises(ValidationError):
        grade("matching", question, {"pairs": [{"left_id": "a", "right_id": "unknown"}, exact[1]]})


def test_rubric_ratings_are_formative_and_use_the_expected_criteria():
    question = {"rubric_criteria": [{"criterion_id": "evidence", "description": "Usa evidencia."}]}
    assert grade("rubric", question, {"text": "Respuesta", "criterion_ratings": {"evidence": 2}}) is None
    with pytest.raises(ValidationError):
        grade("rubric", question, {"text": "Respuesta", "criterion_ratings": {"unknown": 2}})


def test_objective_summary_uses_all_objective_items_and_rounds_to_one_decimal():
    result = summarize_objective_grades([
        ObjectiveGrade(correct=True, feedback=""),
        ObjectiveGrade(correct=False, feedback=""),
        ObjectiveGrade(correct=False, feedback=""),
    ])
    assert (result.correct, result.total, result.score) == (1, 3, 33.3)
    with pytest.raises(ValidationError):
        summarize_objective_grades([])


def test_short_answer_compares_only_declared_normalized_forms():
    question = {"grading_mode": "exact", "expected_answer": ["energía cinética", "energía de movimiento"]}
    assert grade("short_answer", question, {"text": "  ENERGÍA   CINÉTICA "}).correct
    assert not grade("short_answer", question, {"text": "creo que es energía cinética"}).correct


@pytest.mark.parametrize("kind", ["short_answer", "essay"])
def test_open_text_has_no_objective_grade(kind):
    assert grade(kind, {
        "grading_mode": "formative" if kind == "short_answer" else None,
        "rubric_criteria": [{
            "criterion_id": "evidence", "description": "Justifica tu conclusión.",
            "descriptors": ["Cita evidencia."],
        }],
    }, {"text": "Mi explicación."}) is None


def test_step_by_step_grades_the_final_answer_with_or_without_steps():
    rubric = [{
        "criterion_id": "procedure", "description": "Justifica cada paso.",
        "descriptors": ["Muestra el desarrollo."],
    }]
    exact = {"grading_mode": "exact", "expected_answer": ["a"], "rubric_criteria": rubric}
    numeric = {"grading_mode": "numeric", "expected_answer": "3/4", "rubric_criteria": rubric}
    formative = {"grading_mode": "formative", "rubric_criteria": rubric}
    assert grade("step_by_step", exact, {"final_answer": " Ａ "}).correct
    assert not grade("step_by_step", exact, {"final_answer": "B", "steps": "Detalle"}).correct
    assert grade("step_by_step", numeric, {"final_answer": "0,75"}).correct
    with pytest.raises(ValidationError):
        grade("step_by_step", numeric, {"final_answer": "2+2"})
    assert grade("step_by_step", formative, {"final_answer": "Conclusión"}) is None
