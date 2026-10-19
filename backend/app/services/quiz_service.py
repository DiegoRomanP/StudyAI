"""Quiz delivery and grading.

Grades multiple-choice questions automatically, collects flashcard self-ratings,
records a QuizResult, marks the session complete and emits ``session.completed``
so the ProgressService can update SM-2 schedules.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.events.session_events import (
    SESSION_COMPLETED,
    SessionCompletedEvent,
    event_bus,
)
from app.models.plan import Plan
from app.models.quiz import QuestionType, Quiz, QuizQuestion, QuizResult
from app.models.session import Session as StudySession
from app.models.session import SessionStatus
from app.repositories.quiz_repository import QuizRepository
from app.schemas.quiz import QuizResultResponse, QuizSubmission


class QuizService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = QuizRepository(db)

    def get_quiz_for_session(self, user_id: int, session_id: int) -> Quiz:
        quiz = self.repo.find_by_session(session_id)
        if quiz is None or not self._owns_session(user_id, session_id):
            raise NotFoundError("Quiz no encontrado para la sesión.")
        return quiz

    def submit(
        self, user_id: int, quiz_id: int, submission: QuizSubmission
    ) -> QuizResultResponse:
        quiz = self.repo.find_by_id(quiz_id)
        if quiz is None or not self._owns_session(user_id, quiz.session_id):
            raise NotFoundError("Quiz no encontrado.")

        questions: dict[int, QuizQuestion] = {q.id: q for q in quiz.questions}
        # The quiz may have been replaced (AI reinforcement) while the learner answered.
        if any(answer.question_id not in questions for answer in submission.answers):
            raise ConflictError(
                "Las preguntas de este test cambiaron. Vuelve a cargarlo.", "QUIZ_OUTDATED"
            )
        mc_total = 0
        mc_correct = 0
        detail: dict[str, dict] = {}
        flashcard_qualities: dict[int, int] = {}

        for answer in submission.answers:
            question = questions.get(answer.question_id)
            if question is None:
                continue
            if question.question_type == QuestionType.MULTIPLE_CHOICE:
                mc_total += 1
                is_correct = (answer.selected_option or "").strip() == question.answer.strip()
                mc_correct += int(is_correct)
                detail[str(question.id)] = {
                    "type": "multiple_choice",
                    "correct": is_correct,
                    "selected": answer.selected_option,
                    "expected": question.answer,
                }
            elif question.question_type == QuestionType.FLASHCARD:
                if answer.quality is None:
                    raise ValidationError(
                        f"Falta la calidad (0-5) para la flashcard {question.id}."
                    )
                flashcard_qualities[question.id] = int(answer.quality)
                detail[str(question.id)] = {
                    "type": "flashcard",
                    "quality": int(answer.quality),
                }

        score = round((mc_correct / mc_total) * 100, 1) if mc_total else 0.0

        result = QuizResult(
            quiz_id=quiz.id,
            session_id=quiz.session_id,
            score=score,
            detail=detail,
        )
        self.db.add(result)

        # Mark the session complete and emit the event (SM-2 runs in the handler).
        session = self.db.get(StudySession, quiz.session_id)
        first_completion = session.status != SessionStatus.COMPLETED
        session.status = SessionStatus.COMPLETED
        session.completed_at = datetime.now(timezone.utc)
        self.db.add(session)
        self.db.flush()

        event_bus.publish(
            SESSION_COMPLETED,
            SessionCompletedEvent(
                session_id=quiz.session_id,
                user_id=user_id,
                db=self.db,
                flashcard_qualities=flashcard_qualities,
                quiz_result_id=result.id,
                first_completion=first_completion,
            ),
        )
        self.db.commit()

        return QuizResultResponse(
            score=score,
            correct=mc_correct,
            total=mc_total,
            detail=detail,
        )

    def _owns_session(self, user_id: int, session_id: int) -> bool:
        session = self.db.get(StudySession, session_id)
        if session is None:
            return False
        plan = self.db.get(Plan, session.plan_id)
        return plan is not None and plan.user_id == user_id
