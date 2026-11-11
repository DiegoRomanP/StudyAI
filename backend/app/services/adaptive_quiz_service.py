"""Delivery and submission of versioned, deterministic assessments."""

from collections import defaultdict
from datetime import datetime, timezone
from hashlib import sha256
import json

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.events.session_events import SESSION_COMPLETED, SessionCompletedEvent, event_bus
from app.models.quiz import QuestionType, Quiz, QuizQuestion, QuizResult
from app.models.session import SessionKind
from app.pedagogy.answer_normalization import normalize_exact_answer, parse_numeric_answer
from app.pedagogy.contracts import (
    AdaptiveSessionDraft,
    ObjectiveGrade,
    PedagogySnapshot,
    ProcedureRubricWeights,
    StoredAssessmentQuestion,
)
from app.repositories.quiz_repository import QuizRepository
from app.schemas.adaptive_learning import (
    AssessmentAnswerV2,
    AssessmentResponseV2,
    AssessmentResultItemV2,
    AssessmentResultV2,
    AssessmentSubmissionV2,
    FormativeFeedbackV2,
)
from app.services.assessment_graders import grade_objective_answer, summarize_objective_grades
from app.services.adaptive_learning_service import AdaptiveLearningService


def _stored_question_projection(question: StoredAssessmentQuestion) -> dict:
    public = {
        "question_id": question.question_id,
        "kind": question.kind,
        "prompt": question.prompt,
        "objective_ids": question.objective_ids,
        "stimulus_id": question.stimulus_id,
    }
    match question.kind:
        case "multiple_choice":
            public.update(mode=question.mode, options=question.options)
        case "matching":
            public.update(matching_left=question.matching_left, matching_right=question.matching_right)
        case "numeric":
            public["units"] = question.units
        case "sequence":
            public["sequence_items"] = question.sequence_items
        case "rubric":
            public["rubric_criteria"] = question.rubric_criteria
        case "short_answer" | "step_by_step":
            public["grading_mode"] = question.grading_mode
    return public


def _legacy_question_id(question: QuizQuestion) -> str:
    return f"legacy:{question.id}"


def _legacy_question_projection(question: QuizQuestion, draft: AdaptiveSessionDraft) -> dict:
    public_id = _legacy_question_id(question)
    public = {
        "question_id": public_id,
        "prompt": question.prompt,
        "objective_ids": draft.adaptive_assessment.question_objectives.get(public_id, []),
    }
    if question.question_type == QuestionType.FLASHCARD:
        public.update(kind="flashcard", flashcard_answer=question.answer)
    else:
        public.update(kind="multiple_choice", mode="single", options=question.options)
    return public


def _require_answerable_legacy_questions(quiz: Quiz) -> None:
    for question in quiz.questions:
        if question.question_type == QuestionType.MULTIPLE_CHOICE and (
            not question.options or question.answer not in question.options
        ):
            raise ConflictError(
                "El contenido de la sesión todavía no está disponible.", "CONTENT_NOT_READY"
            )


class AdaptiveQuizService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.learning = AdaptiveLearningService(db)
        self.quizzes = QuizRepository(db)

    def get_assessment(self, user_id: int, session_id: int) -> AssessmentResponseV2:
        session = self.learning.sessions.get_session(user_id, session_id)
        draft = self.learning.require_published_content(session)
        _require_answerable_legacy_questions(session.quiz)
        questions = [
            *(_legacy_question_projection(question, draft) for question in session.quiz.questions),
            *(_stored_question_projection(question) for question in draft.adaptive_assessment.questions),
        ]
        snapshot = draft.pedagogy_snapshot
        if isinstance(snapshot, PedagogySnapshot):
            historical_formats = {"numeric": "short_answer", "sequence": "matching", "rubric": "essay"}
            for question in questions:
                format_ = historical_formats.get(question["kind"], question["kind"])
                question["estimated_minutes_per_question"] = snapshot.question_time_overrides.get(
                    format_, snapshot.estimated_minutes_per_question
                )

        if session.kind == SessionKind.REVIEW:
            missed = {item.get("question_id") for item in session.review_points or []}
            questions.sort(key=lambda question: question["question_id"] not in missed)

        return AssessmentResponseV2.model_validate({
            "quiz_id": session.quiz.id,
            "revision": draft.assessment_revision,
            "questions": questions,
            "stimuli": draft.adaptive_assessment.stimuli,
        })

    def latest_result(self, user_id: int, session_id: int) -> AssessmentResultV2:
        session = self.learning.sessions.get_session(user_id, session_id)
        draft = self.learning.require_published_content(session)
        meta = self._stored_result(session.quiz, draft)
        return AssessmentResultV2.model_validate(meta["result"])

    def _stored_result(self, quiz: Quiz, draft: AdaptiveSessionDraft) -> dict:
        if draft.assessment_state == "submitted":
            result = self.quizzes.latest_result_for_session(quiz.session_id)
            if result is not None and result.quiz_id == quiz.id:
                meta = (result.detail or {}).get("_meta")
                if isinstance(meta, dict) and meta.get("revision") == draft.assessment_revision:
                    if meta.get("schema_version") == 2 and "result" in meta:
                        return meta
        raise NotFoundError("Esta sesión aún no tiene resultado.")

    def _load_for_submit(self, user_id: int, quiz_id: int) -> tuple[Quiz, AdaptiveSessionDraft]:
        quiz = self.quizzes.find_by_id(quiz_id)
        if quiz is None:
            raise NotFoundError("Quiz no encontrado.")
        session = self.learning.sessions.get_session(user_id, quiz.session_id)
        draft = self.learning.require_published_content(session)
        _require_answerable_legacy_questions(quiz)
        return quiz, draft

    def submit(
        self, user_id: int, quiz_id: int, submission: AssessmentSubmissionV2
    ) -> AssessmentResultV2:
        quiz, draft = self._load_for_submit(user_id, quiz_id)
        revision = submission.revision
        _require_current_revision(draft, revision)
        if draft.assessment_state == "submitted":
            return self._replay(quiz, draft, submission)

        result, detail, qualities, fingerprint = _evaluate(quiz, draft, submission)
        try:
            claimed = self.quizzes.claim_adaptive_submission(quiz, revision, datetime.now(timezone.utc))
            if not claimed:
                self.db.rollback()
                quiz, draft = self._load_for_submit(user_id, quiz_id)
                _require_current_revision(draft, revision)
                return self._replay(quiz, draft, submission)

            detail["_meta"] = {
                "type": "_meta",
                "schema_version": 2,
                "revision": revision,
                "fingerprint": fingerprint,
                "result": result.model_dump(mode="json"),
            }
            stored = QuizResult(
                quiz_id=quiz.id, session_id=quiz.session_id, score=result.score, detail=detail
            )
            self.db.add(stored)
            self.db.flush()
            event_bus.publish(
                SESSION_COMPLETED,
                SessionCompletedEvent(
                    session_id=quiz.session_id, user_id=user_id, db=self.db,
                    flashcard_qualities=qualities, quiz_result_id=stored.id,
                ),
                strict=True,
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return result

    def _replay(
        self, quiz: Quiz, draft: AdaptiveSessionDraft, submission: AssessmentSubmissionV2
    ) -> AssessmentResultV2:
        if draft.assessment_state == "submitted":
            meta = self._stored_result(quiz, draft)
            try:
                matches = meta["fingerprint"] == _fingerprint(submission.answers, draft)
            except ValueError:
                matches = False
            if matches:
                return AssessmentResultV2.model_validate(meta["result"])
        raise ConflictError("Esta evaluación ya fue entregada.", "ASSESSMENT_ALREADY_SUBMITTED")


def _require_current_revision(draft: AdaptiveSessionDraft, revision: str) -> None:
    if draft.assessment_revision != revision:
        raise ConflictError("Las preguntas de este test cambiaron. Vuelve a cargarlo.", "QUIZ_OUTDATED")


def _fingerprint(answers: list[AssessmentAnswerV2], draft: AdaptiveSessionDraft) -> str:
    grading_modes = {q.question_id: q.grading_mode for q in draft.adaptive_assessment.questions}
    canonical = []
    for answer in sorted(answers, key=lambda item: item.question_id):
        payload = answer.model_dump(mode="json")
        grading_mode = grading_modes.get(answer.question_id)
        match answer.kind:
            case "multiple_choice" if answer.selected_options is not None:
                payload["selected_options"] = sorted(answer.selected_options)
            case "matching":
                payload["pairs"].sort(key=lambda pair: pair["left_id"])
            case "numeric":
                payload["value"] = str(parse_numeric_answer(answer.value))
            case "short_answer" if grading_mode == "exact":
                payload["text"] = normalize_exact_answer(answer.text)
            case "step_by_step" if grading_mode == "exact":
                payload["final_answer"] = normalize_exact_answer(answer.final_answer)
            case "step_by_step" if grading_mode == "numeric":
                payload["final_answer"] = str(parse_numeric_answer(answer.final_answer))
        canonical.append(payload)
    encoded = json.dumps(canonical, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    return sha256(encoded).hexdigest()


def _grade_legacy(question: QuizQuestion, answer: AssessmentAnswerV2) -> AssessmentResultItemV2:
    if question.question_type == QuestionType.FLASHCARD and answer.kind == "flashcard":
        return AssessmentResultItemV2(question_id=answer.question_id, kind="flashcard", quality=answer.quality)
    if (
        question.question_type != QuestionType.MULTIPLE_CHOICE
        or answer.kind != "multiple_choice"
        or answer.selected_option not in question.options
    ):
        raise ValidationError("La respuesta no corresponde a la pregunta.")
    correct = answer.selected_option == question.answer
    return AssessmentResultItemV2(
        question_id=answer.question_id,
        kind="multiple_choice",
        correct=correct,
        submitted_answer=answer.selected_option,
        expected_answer=question.answer,
        feedback="Respuesta correcta." if correct else "Revisa la solución de esta pregunta.",
    )


def _grade_stored(
    question: StoredAssessmentQuestion,
    answer: AssessmentAnswerV2,
    procedure_weights: ProcedureRubricWeights | None,
) -> tuple[AssessmentResultItemV2 | None, FormativeFeedbackV2 | None]:
    grade = grade_objective_answer(question, answer)
    formative = _formative_feedback(question, answer, procedure_weights) if (
        grade is None or answer.kind == "step_by_step"
    ) else None
    if grade is None:
        return None, formative

    expected = question.expected_answer
    match answer.kind:
        case "multiple_choice":
            submitted = answer.selected_option if answer.selected_option is not None else answer.selected_options
        case "true_false":
            submitted = answer.answer
        case "matching":
            submitted, expected = answer.pairs, question.matching_pairs
        case "numeric":
            submitted = answer.value
        case "sequence":
            submitted = answer.ordered_ids
        case "short_answer":
            submitted = answer.text
        case "step_by_step":
            submitted = answer.final_answer
        case _:
            raise ValidationError("El formato de respuesta no está disponible.")
    return AssessmentResultItemV2(
        question_id=question.question_id, kind=question.kind, correct=grade.correct,
        submitted_answer=submitted, expected_answer=expected, feedback=grade.feedback,
        grounded_feedback=question.feedback,
    ), formative


def _formative_feedback(
    question: StoredAssessmentQuestion,
    answer: AssessmentAnswerV2,
    procedure_weights: ProcedureRubricWeights | None,
) -> FormativeFeedbackV2:
    feedback = FormativeFeedbackV2(
        question_id=question.question_id,
        criteria=question.rubric_criteria,
        exemplar=question.exemplar,
        message="Contrasta tu respuesta con los criterios de la rúbrica.",
        grounded_feedback=question.feedback,
    )
    if answer.kind == "step_by_step":
        feedback.submitted_text = answer.steps
        feedback.submitted_final_answer = answer.final_answer
        feedback.procedure_rubric_weights = procedure_weights
        if not answer.steps.strip():
            feedback.message = "Agrega los pasos o la justificación para valorar tu procedimiento."
    elif answer.kind in ("essay", "short_answer", "rubric"):
        feedback.submitted_text = answer.text
        if answer.kind == "rubric":
            feedback.criterion_ratings = answer.criterion_ratings
    return feedback


def _evaluate(
    quiz: Quiz, draft: AdaptiveSessionDraft, submission: AssessmentSubmissionV2
) -> tuple[AssessmentResultV2, dict[str, dict], dict[int, int], str]:
    legacy = {_legacy_question_id(question): question for question in quiz.questions}
    stored = {question.question_id: question for question in draft.adaptive_assessment.questions}
    answers = {answer.question_id: answer for answer in submission.answers}
    if len(answers) != len(submission.answers) or answers.keys() != (legacy.keys() | stored.keys()):
        raise ValidationError("Responde todas las preguntas de la evaluación una sola vez.")

    grades = []
    detail = {}
    qualities = {}
    objective_grades: dict[str, list[bool]] = defaultdict(list)
    public_detail = []
    formative_feedback = []
    snapshot = draft.pedagogy_snapshot
    weights = snapshot.procedure_rubric_weights if isinstance(snapshot, PedagogySnapshot) else None
    for question_id in [*legacy, *stored]:
        answer = answers[question_id]
        if question_id in legacy:
            question = legacy[question_id]
            item = _grade_legacy(question, answer)
            formative = None
            objective_ids = draft.adaptive_assessment.question_objectives.get(question_id, [])
            if item.quality is not None:
                qualities[question.id] = item.quality
        else:
            question = stored[question_id]
            item, formative = _grade_stored(question, answer, weights)
            objective_ids = question.objective_ids

        entry = {"type": answer.kind, "objective": item is not None and item.correct is not None}
        if formative is not None:
            formative_feedback.append(formative)
        if item is not None:
            public_detail.append(item)
            if item.quality is not None:
                entry["quality"] = item.quality
            if item.correct is not None:
                entry["correct"] = item.correct
                grades.append(ObjectiveGrade(correct=item.correct, feedback=item.feedback))
                for objective_id in dict.fromkeys(objective_ids):
                    objective_grades[objective_id].append(item.correct)
        detail[question_id] = entry

    totals = summarize_objective_grades(grades)
    result = AssessmentResultV2(
        quiz_id=quiz.id, revision=submission.revision, **totals.model_dump(),
        detail=public_detail, formative_feedback=formative_feedback,
        objective_results=[
            {"objective_id": objective_id, "correct": sum(grades), "total": len(grades)}
            for objective_id, grades in sorted(objective_grades.items())
        ],
    )
    return result, detail, qualities, _fingerprint(submission.answers, draft)
