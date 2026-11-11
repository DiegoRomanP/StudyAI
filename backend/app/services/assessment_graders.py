"""Deterministic objective grading for adaptive assessments."""

from collections.abc import Sequence

from app.core.exceptions import ValidationError
from app.pedagogy.answer_normalization import normalize_exact_answer, parse_numeric_answer
from app.pedagogy.contracts import ObjectiveGrade, ObjectiveTotals, StoredAssessmentQuestion
from app.schemas.adaptive_learning import AssessmentAnswerV2, MultipleChoiceAnswerV2


def _multiple_choice_correct(question: StoredAssessmentQuestion, answer: MultipleChoiceAnswerV2) -> bool:
    if question.mode == "single":
        selected = answer.selected_option
        if selected is None or selected not in question.options:
            raise ValidationError("Selecciona una de las opciones de la pregunta.")
        return selected == question.expected_answer

    selected_options = answer.selected_options
    if not selected_options or not set(selected_options).issubset(question.options):
        raise ValidationError("Selecciona únicamente opciones de la pregunta.")
    expected = question.expected_answer
    if not isinstance(expected, list):
        raise ValidationError("La pregunta no tiene una clave de selección válida.")
    return set(selected_options) == set(expected)


def _numeric_correct(expected: object, submitted: str) -> bool:
    if not isinstance(expected, str):
        raise ValidationError("La pregunta no tiene una clave numérica válida.")
    try:
        return parse_numeric_answer(submitted) == parse_numeric_answer(expected)
    except ValueError as exc:
        raise ValidationError(str(exc)) from exc


def _exact_text_correct(expected: object, submitted: str) -> bool:
    if not isinstance(expected, list):
        raise ValidationError("La pregunta no tiene una clave de texto válida.")
    return normalize_exact_answer(submitted) in {normalize_exact_answer(value) for value in expected}


def grade_objective_answer(
    question: StoredAssessmentQuestion, answer: AssessmentAnswerV2
) -> ObjectiveGrade | None:
    if answer.question_id != question.question_id or answer.kind != question.kind:
        raise ValidationError("La respuesta no corresponde a la pregunta.")

    match answer.kind:
        case "multiple_choice":
            correct = _multiple_choice_correct(question, answer)
        case "true_false":
            correct = answer.answer == question.expected_answer
        case "numeric":
            correct = _numeric_correct(question.expected_answer, answer.value)
        case "short_answer":
            if question.grading_mode == "formative":
                return None
            correct = _exact_text_correct(question.expected_answer, answer.text)
        case "essay":
            return None
        case "step_by_step":
            if question.grading_mode == "formative":
                return None
            if question.grading_mode == "numeric":
                correct = _numeric_correct(question.expected_answer, answer.final_answer)
            else:
                correct = _exact_text_correct(question.expected_answer, answer.final_answer)
        case "matching":
            expected = {pair.left_id: pair.right_id for pair in question.matching_pairs}
            submitted = {pair.left_id: pair.right_id for pair in answer.pairs}
            if submitted.keys() != expected.keys() or set(submitted.values()) != set(expected.values()):
                raise ValidationError("Relaciona todos los elementos de ambas columnas.")
            correct = submitted == expected
        case "sequence":
            ids = {item.id for item in question.sequence_items}
            if len(answer.ordered_ids) != len(ids) or set(answer.ordered_ids) != ids:
                raise ValidationError("Ordena cada elemento de la secuencia una vez.")
            correct = answer.ordered_ids == question.expected_answer
        case "rubric":
            criteria = {criterion.criterion_id for criterion in question.rubric_criteria}
            if not answer.text.strip() or answer.criterion_ratings.keys() != criteria:
                raise ValidationError("Responde la pregunta y completa sus criterios de autoevaluación.")
            return None
        case _:
            raise ValidationError("El formato de respuesta no está disponible.")

    feedback = "Respuesta correcta." if correct else "Revisa la solución de esta pregunta."
    return ObjectiveGrade(correct=correct, feedback=feedback)


def summarize_objective_grades(grades: Sequence[ObjectiveGrade]) -> ObjectiveTotals:
    if not grades:
        raise ValidationError("La evaluación requiere al menos una pregunta objetiva.")
    correct = sum(grade.correct for grade in grades)
    return ObjectiveTotals(correct=correct, total=len(grades), score=round(correct / len(grades) * 100, 1))
