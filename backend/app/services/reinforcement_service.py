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

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, DailyLimitError, LLMError
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.llm.factory import get_llm_provider
from app.llm.output_budget import complete_within_budget
from app.llm.output_parsers import parse_llm_json
from app.llm.prompts import session_content
from app.llm.prompts.reinforcement import build_reinforcement_prompt
from app.models.goal import Goal
from app.models.plan import Plan
from app.models.quiz import QuizQuestion
from app.models.session import ReinforcementStatus as Status
from app.models.session import Session as StudySession
from app.models.session import SessionKind, SessionStatus
from app.services.free_ai_quota import FreeAiQuota, uses_free_ai
from app.services.session_content_builder import build_session_content
from app.services.session_service import SessionService
from app.strategies.goal_strategies import GoalStrategyFactory

logger = get_logger(__name__)

_NOT_AVAILABLE = ConflictError("Este repaso no admite refuerzo con IA.", "REINFORCEMENT_NOT_AVAILABLE")
_GENERIC_FAILURE = "No se pudo generar el refuerzo. Inténtalo de nuevo."


def _set_status(db: Session, session_id: int, new: Status, *, only_if: list[Status], error: str = "") -> int:
    result = db.execute(
        update(StudySession)
        .where(StudySession.id == session_id, StudySession.reinforcement_status.in_(only_if))
        .values(reinforcement_status=new, reinforcement_error=error)
    )
    db.commit()
    return result.rowcount


class ReinforcementService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def start(self, user_id: int, session_id: int) -> tuple[StudySession, bool, bool]:
        """Returns ``(session, start_task, spent_free_use)``."""
        session = SessionService(self.db).get_session(user_id, session_id)
        if (
            session.kind != SessionKind.REVIEW
            or session.status != SessionStatus.PENDING
            or session.reinforcement_status == Status.READY
        ):
            raise _NOT_AVAILABLE

        # Reserve the state before touching the quota (FreeAiQuota commits on its own),
        # so a double POST starts one task and spends one use.
        claimed = self.db.execute(
            update(StudySession)
            .where(
                StudySession.id == session_id,
                StudySession.kind == SessionKind.REVIEW,
                StudySession.status == SessionStatus.PENDING,
                StudySession.reinforcement_status.in_([Status.NONE, Status.FAILED]),
            )
            .values(reinforcement_status=Status.PROCESSING, reinforcement_error="")
        )
        self.db.commit()
        if claimed.rowcount == 0:
            self.db.refresh(session)
            if session.reinforcement_status == Status.PROCESSING:
                return session, False, False  # idempotent replay
            raise _NOT_AVAILABLE

        spent = uses_free_ai(self.db, user_id)
        if spent:
            try:
                FreeAiQuota(self.db).consume(user_id)
            except DailyLimitError:
                _set_status(self.db, session_id, Status.NONE, only_if=[Status.PROCESSING])
                raise
        self.db.refresh(session)
        return session, True, spent

    def cancel(self, user_id: int, session_id: int) -> StudySession:
        """PROCESSING → NONE. The use is not refunded here: only the task does that."""
        session = SessionService(self.db).get_session(user_id, session_id)
        _set_status(self.db, session_id, Status.NONE, only_if=[Status.PROCESSING])
        self.db.refresh(session)
        return session


def _refund(db: Session, user_id: int, spent: bool) -> None:
    if not spent:
        return
    try:
        FreeAiQuota(db).refund(user_id)
    except Exception:  # noqa: BLE001 - bookkeeping must never hide the real outcome
        logger.warning("Could not refund the free AI use for user %s", user_id)


def generate_reinforcement_task(session_id: int, user_id: int, spent: bool) -> None:
    """Background worker: builds the reinforcement content for one review session."""
    db = SessionLocal()
    llm = None
    try:
        session = db.get(StudySession, session_id)
        if session is None:  # the plan was deleted in the meantime
            _refund(db, user_id, spent)
            return
        plan = db.get(Plan, session.plan_id)
        goal = db.get(Goal, plan.goal_id)
        goal_text = f"{goal.title}. {goal.description}".strip()
        config = GoalStrategyFactory.create(goal.goal_type).get_session_config()
        points = list(session.review_points or [])
        excerpt = (session.material.content_markdown if session.material else "")[:4000]
        try:
            llm = get_llm_provider(db, user_id)
            raw = complete_within_budget(
                llm,
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
            claimed = db.execute(
                update(StudySession)
                .where(
                    StudySession.id == session_id,
                    StudySession.reinforcement_status == Status.PROCESSING,
                    StudySession.status == SessionStatus.PENDING,
                )
                .values(reinforcement_status=Status.READY, reinforcement_error="")
            )
            if claimed.rowcount == 0:  # cancelled or completed while the model was answering
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
            _set_status(db, session_id, Status.FAILED, only_if=[Status.PROCESSING], error=message)
            _refund(db, user_id, spent)
            logger.error(
                "Reinforcement failed for session %s (code=%s)", session_id, getattr(exc, "code", "UNKNOWN")
            )
    finally:
        if llm is not None:
            llm.close()
        db.close()
