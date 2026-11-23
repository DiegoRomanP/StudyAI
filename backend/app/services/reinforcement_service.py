"""AI reinforcement of a review session.

One LLM call replaces a REVIEW's material and quiz with content built around the
questions the learner failed. The state machine lives in ``Session.reinforcement_status``:

    NONE ──start──▶ PROCESSING ──task OK──▶ READY
                       │  └──task fails──▶ FAILED ──start──▶ PROCESSING
                       └──cancel──▶ NONE

Every transition is a conditional UPDATE, so concurrent requests, a cancel racing the
background task, or a double POST can never apply two writes or spend two uses.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, LLMError
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.llm.factory import get_llm_provider
from app.llm.output_budget import complete_within_budget
from app.services.usage_recorder import UsageRecorder
from app.llm.output_parsers import parse_llm_json
from app.llm.prompts import adaptive_session_content, session_content
from app.llm.prompts.reinforcement import build_reinforcement_prompt
from app.models.flashcard import FlashcardReview
from app.models.goal import Goal, GoalType
from app.models.plan import Plan
from app.models.quiz import QuestionType, QuizQuestion
from app.models.session import ReinforcementStatus as Status
from app.models.session import Session as StudySession
from app.models.session import SessionKind, SessionStatus
from app.pedagogy.contracts import PedagogySnapshot
from app.rag.retriever import Retriever
from app.repositories.adaptive_content_repository import AdaptiveContentRepository
from app.services.adaptive_content_builder import AdaptiveBuiltContent, build_adaptive_session_content
from app.services.adaptive_learning_service import AdaptiveLearningService
from app.services.ai_charge import AiCharge, charge_reinforcement, refund_charge
from app.services.session_content_builder import build_session_content
from app.services.session_service import SessionService
from app.strategies.base import SessionConfig
from app.strategies.goal_strategies import GoalStrategyFactory

if TYPE_CHECKING:
    from app.llm.base import LLMProvider

logger = get_logger(__name__)

_NOT_AVAILABLE = ConflictError("Este repaso no admite refuerzo con IA.", "REINFORCEMENT_NOT_AVAILABLE")
_GENERIC_FAILURE = "No se pudo generar el refuerzo. Inténtalo de nuevo."


def recover_interrupted_reinforcements(db: Session) -> None:
    """At startup, a PROCESSING reinforcement has no live task left. Its use is not refunded."""
    result = db.execute(
        update(StudySession)
        .where(StudySession.reinforcement_status == Status.PROCESSING)
        .values(
            reinforcement_status=Status.FAILED,
            reinforcement_error="El refuerzo se interrumpió porque el servidor se reinició. Inténtalo de nuevo.",
            reinforcement_run_token=None,
        )
    )
    db.commit()
    if result.rowcount:
        logger.warning("Marked %d interrupted reinforcement(s) as failed", result.rowcount)


def _set_status(
    db: Session,
    session_id: int,
    new: Status,
    *,
    only_if: list[Status],
    error: str = "",
    run_token: str | None = None,
) -> int:
    result = db.execute(
        update(StudySession)
        .where(
            StudySession.id == session_id,
            StudySession.reinforcement_status.in_(only_if),
            StudySession.reinforcement_run_token == run_token,
        )
        .values(reinforcement_status=new, reinforcement_error=error, reinforcement_run_token=None)
    )
    db.commit()
    return result.rowcount


class ReinforcementService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def start(self, user_id: int, session_id: int) -> tuple[StudySession, bool, AiCharge | None, str | None]:
        """Return the session and the scheduling details of this specific claim."""
        session = SessionService(self.db).get_session(user_id, session_id)
        if (
            session.kind != SessionKind.REVIEW
            or session.status != SessionStatus.PENDING
            or session.reinforcement_status == Status.READY
        ):
            raise _NOT_AVAILABLE

        if session.plan.content_version == 2:
            draft = AdaptiveLearningService(self.db).require_published_content(session)
            if not isinstance(draft.pedagogy_snapshot, PedagogySnapshot):
                raise _NOT_AVAILABLE

        # Reserve the state before touching the quota (FreeAiQuota commits on its own),
        # so a double POST starts one task and spends one use.
        run_token = uuid4().hex if session.plan.content_version == 2 else None
        claimed = self.db.execute(
            update(StudySession)
            .where(
                StudySession.id == session_id,
                StudySession.kind == SessionKind.REVIEW,
                StudySession.status == SessionStatus.PENDING,
                StudySession.reinforcement_status.in_([Status.NONE, Status.FAILED]),
            )
            .values(
                reinforcement_status=Status.PROCESSING,
                reinforcement_error="",
                reinforcement_run_token=run_token,
            )
        )
        self.db.commit()
        if claimed.rowcount == 0:
            self.db.refresh(session)
            if session.reinforcement_status == Status.PROCESSING:
                return session, False, None, None  # idempotent replay
            raise _NOT_AVAILABLE

        try:
            spent = charge_reinforcement(self.db, user_id, session_id)
        except Exception:
            # No task will run (over the limit / no credits, or an unexpected error): release the claim.
            self.db.rollback()
            try:
                _set_status(
                    self.db, session_id, Status.NONE, only_if=[Status.PROCESSING], run_token=run_token
                )
            except Exception:  # noqa: BLE001 - startup recovery fails it if even this cannot be written
                self.db.rollback()
                logger.warning("Could not release the reinforcement claim of session %s", session_id)
            raise
        self.db.refresh(session)
        return session, True, spent, run_token

    def cancel(self, user_id: int, session_id: int) -> StudySession:
        """PROCESSING → NONE. The use is not refunded here: only the task does that."""
        session = SessionService(self.db).get_session(user_id, session_id)
        _set_status(
            self.db, session_id, Status.NONE, only_if=[Status.PROCESSING],
            run_token=session.reinforcement_run_token,
        )
        self.db.refresh(session)
        return session


def _refund(db: Session, user_id: int, spent: AiCharge | None) -> None:
    """Give the charge back: the free use on the day it was spent, or the credit it took."""
    refund_charge(db, user_id, spent)


def _claim_publication(db: Session, session_id: int, run_token: str | None) -> bool:
    result = db.execute(
        update(StudySession)
        .where(
            StudySession.id == session_id,
            StudySession.reinforcement_status == Status.PROCESSING,
            StudySession.status == SessionStatus.PENDING,
            StudySession.reinforcement_run_token == run_token,
        )
        .values(reinforcement_status=Status.READY, reinforcement_error="", reinforcement_run_token=None)
    )
    return result.rowcount == 1


def _publish_adaptive_content(
    db: Session, session: StudySession, content: AdaptiveBuiltContent
) -> None:
    quiz = session.quiz
    card_ids = [question.id for question in quiz.questions if question.question_type == QuestionType.FLASHCARD]
    if card_ids:
        # Copied cards point to the original schedule. The discarded IDs are
        # the only rows this replacement owns.
        db.execute(delete(FlashcardReview).where(FlashcardReview.question_id.in_(card_ids)))
    quiz.questions.clear()
    db.flush()
    for index, card in enumerate(content.flashcards):
        quiz.questions.append(QuizQuestion(
            question_type=QuestionType.FLASHCARD, order_index=index,
            prompt=card["prompt"], answer=card["answer"],
        ))
    db.flush()

    draft = content.draft
    objectives = {
        f"legacy:{question.id}": card["objective_ids"]
        for question, card in zip(quiz.questions, content.flashcards, strict=True)
    }
    session.review_points = []
    session.material.content_markdown = content.content_markdown
    session.material.youtube_keywords = content.keywords
    AdaptiveContentRepository(db).save(session.id, draft.model_copy(update={
        "adaptive_assessment": draft.adaptive_assessment.model_copy(update={
            "question_objectives": objectives,
        }),
    }))


def _generate_adaptive_content(
    db: Session,
    llm: LLMProvider,
    session: StudySession,
    plan: Plan,
    goal_text: str,
    config: SessionConfig,
    recorder: UsageRecorder | None = None,
) -> AdaptiveBuiltContent:
    draft = AdaptiveLearningService(db).require_published_content(session)
    snapshot = draft.pedagogy_snapshot
    if not isinstance(snapshot, PedagogySnapshot):
        raise _NOT_AVAILABLE
    points = session.review_points or []
    chunks = Retriever().retrieve_texts(
        session.topic_name, top_k=4, document_ids=plan.document_ids
    ) if plan.document_ids else []
    sources = adaptive_session_content.index_source_chunks(chunks)
    raw = complete_within_budget(
        llm,
        recorder=recorder,
        kind="session_content",
        system=adaptive_session_content.SYSTEM,
        prompt=adaptive_session_content.build_adaptive_session_prompt(
            session.topic_name, goal_text, sources, config, snapshot,
            failed_points=points, previous_lesson=session.material.content_markdown[:4000],
            rich_content=llm.rich_content,
        ),
        context={
            "content_version": 2,
            "pedagogy_snapshot": snapshot.model_dump(mode="json"),
            "sources": sources,
            "topic": session.topic_name,
            "goal_title": goal_text,
            "flashcards": config.flashcards,
            "multiple_choice": config.multiple_choice,
            "reinforcement": True,
            "failed_points": points,
        },
    )
    return build_adaptive_session_content(parse_llm_json(raw), config, snapshot, sources)


def generate_reinforcement_task(
    session_id: int, user_id: int, spent: AiCharge | None, run_token: str | None = None
) -> None:
    """Background worker: builds the reinforcement content for one review session."""
    db = SessionLocal()
    llm = None
    try:
        session = db.get(StudySession, session_id)
        if session is None:  # the plan was deleted in the meantime
            _refund(db, user_id, spent)
            return
        plan = db.get(Plan, session.plan_id)
        if plan is None:
            _refund(db, user_id, spent)
            return
        if plan.content_version == 2 and (
            run_token is None
            or session.reinforcement_run_token != run_token
            or session.reinforcement_status != Status.PROCESSING
            or session.status != SessionStatus.PENDING
        ):
            _refund(db, user_id, spent)
            return
        goal = db.get(Goal, plan.goal_id)
        if goal is None:
            _refund(db, user_id, spent)
            return
        goal_text = f"{goal.title}. {goal.description}".strip()
        try:
            goal_type = goal.goal_type
            if plan.content_version == 2 and plan.generation_goal_type is not None:
                goal_type = GoalType(plan.generation_goal_type)
            config = GoalStrategyFactory.create(goal_type).get_session_config()
            llm = get_llm_provider(db, user_id)
            recorder = UsageRecorder(user_id=user_id, plan_id=plan.id, session_id=session_id)
            if plan.content_version == 2:
                adaptive = _generate_adaptive_content(db, llm, session, plan, goal_text, config, recorder)
                if not _claim_publication(db, session_id, run_token):
                    db.rollback()
                    _refund(db, user_id, spent)
                    return
                _publish_adaptive_content(db, session, adaptive)
                db.commit()
                return
            points = list(session.review_points or [])
            excerpt = (session.material.content_markdown if session.material else "")[:4000]
            raw = complete_within_budget(
                llm,
                recorder=recorder,
                kind="session_content",
                system=session_content.SYSTEM,
                prompt=build_reinforcement_prompt(
                    session.topic_name, goal_text, points, excerpt, config.flashcards, config.multiple_choice
                ),
                context={
                    "topic": session.topic_name,
                    "goal_title": goal_text,
                    "flashcards": config.flashcards,
                    "multiple_choice": config.multiple_choice,
                    "reinforcement": True,
                    "failed_points": points,
                },
            )
            content = build_session_content(parse_llm_json(raw), config)
            if not content.material_markdown.strip() or not content.questions:
                raise LLMError("La IA no devolvió material de refuerzo válido.", code="LLM_INVALID_RESPONSE")
            if not _claim_publication(db, session_id, run_token):
                db.rollback()
                _refund(db, user_id, spent)
                return
            db.refresh(session)
            session.material.content_markdown = content.material_markdown
            session.material.youtube_keywords = content.keywords
            # The copies hold no SM-2 schedule of their own (reviews key on the source card).
            session.quiz.questions.clear()
            db.flush()
            session.quiz.questions.extend(QuizQuestion(**question) for question in content.questions)
            db.commit()
        except Exception as exc:  # noqa: BLE001 - record a safe failure for the learner
            db.rollback()
            message = str(exc)[:1000] if isinstance(exc, LLMError) else _GENERIC_FAILURE
            _set_status(
                db, session_id, Status.FAILED, only_if=[Status.PROCESSING],
                error=message, run_token=run_token,
            )
            _refund(db, user_id, spent)
            logger.error(
                "Reinforcement failed for session %s (code=%s)", session_id, getattr(exc, "code", "UNKNOWN")
            )
    finally:
        if llm is not None:
            llm.close()
        db.close()
