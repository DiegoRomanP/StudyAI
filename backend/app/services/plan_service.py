"""Plan generation orchestrator.

Coordinates the whole AI pipeline for a plan:
    1. Retrieve relevant chunks (RAG).
    2. LLM call #1 — topic analysis.
    3. Pareto-select the highest-relevance topics.
    4. LLM call #2 — distribute topics into spaced sessions.
    5. LLM call #3 — per-session study material + quiz, merged into one call.

Total LLM calls per plan: 2 + (1 per session) — halved from the original
2 + (2 per session) by merging the per-session material/quiz calls, since
that per-session multiplier is what actually exhausts a rate-limited
free-tier provider's request budget.

The public API is small: ``create_plan`` (synchronous, returns a PROCESSING
plan) and ``generate_plan_task`` (the background worker that fills it in).
"""

from __future__ import annotations

import hashlib
import json
import time
from datetime import date, datetime, timedelta, timezone
from typing import get_args

from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import (
    ConflictError,
    LLMError,
    NotFoundError,
    PlanDocumentsUnavailableError,
)
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.algorithms.adaptive_route import normalize
from app.algorithms.pareto import select_top_by_relevance
from app.llm.base import LLMProvider
from app.llm.factory import get_llm_provider, resolve_llm_provider
from app.llm.output_budget import complete_within_budget
from app.services.usage_recorder import UsageRecorder
from app.llm.output_parsers import parse_llm_json
from app.llm.prompts import (
    adaptive_session_content,
    plan_generation,
    session_content,
    topic_analysis,
)
from app.services.adaptive_content_builder import build_adaptive_session_content
from app.services.session_content_builder import build_session_content
from app.models.document import DocumentStatus
from app.models.assistant_message import AssistantMessage
from app.models.flashcard import FlashcardReview
from app.models.goal import Goal, GoalType
from app.models.plan import GenerationStage, Plan, PlanStatus, PlanTopic
from app.models.quiz import QuestionType, Quiz, QuizQuestion
from app.models.session import Session as StudySession, SessionKind
from app.models.session import SessionMaterial
from app.repositories.adaptive_content_repository import AdaptiveContentRepository
from app.repositories.document_repository import DocumentRepository
from app.repositories.plan_repository import PlanRepository
from app.rag.retriever import Retriever
from app.services.free_ai_quota import FreeAiQuota, uses_free_ai
from app.pedagogy.contracts import LearningObjective, PedagogySnapshot, ProfileId
from app.pedagogy.registry import resolve_profile, snapshot_profile
from app.strategies.goal_strategies import GoalStrategyFactory
from app.utils.text import extract_keywords

logger = get_logger(__name__)
_CANONICAL_TOPIC_PROFILES = tuple(
    profile_id for profile_id in get_args(ProfileId) if profile_id != "general"
)


class PlanService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = PlanRepository(db)

    def create_plan(
        self,
        user_id: int,
        goal_id: int,
        document_ids: list[int],
        idempotency_key: str | None = None,
        content_version: int = 1,
        subject_hint: str | None = None,
        profile_hint: str | None = None,
    ) -> tuple[Plan, bool]:
        goal = self.db.get(Goal, goal_id)
        if goal is None or goal.user_id != user_id:
            raise NotFoundError("Meta no encontrada.")

        document_ids = list(dict.fromkeys(document_ids))
        generation_goal_type = goal.goal_type.value if content_version == 2 else None
        request_hash = self._idempotency_request_hash(
            goal_id,
            document_ids,
            content_version=content_version,
            subject_hint=subject_hint,
            profile_hint=profile_hint,
            generation_goal_type=generation_goal_type,
        )
        legacy_v2_request_hash = (
            self._idempotency_request_hash(
                goal_id,
                document_ids,
                content_version=content_version,
                subject_hint=subject_hint,
                profile_hint=profile_hint,
            )
            if content_version == 2
            else None
        )
        if idempotency_key is not None:
            existing = self._find_idempotent_plan(user_id, idempotency_key)
            if existing is not None:
                return self._check_idempotency_payload(
                    existing, request_hash, legacy_v2_request_hash
                ), False

        self._require_indexed_documents(user_id, document_ids)

        # Spent before the plan exists, so a learner over the daily limit gets a 429 and no row.
        spent_day = FreeAiQuota(self.db).consume(user_id) if uses_free_ai(self.db, user_id) else None

        plan = Plan(
            user_id=user_id,
            goal_id=goal_id,
            title=f"Plan: {goal.title}"[:255],  # goal titles may use all 255 chars
            status=PlanStatus.PROCESSING,
            document_ids=list(document_ids),
            content_version=content_version,
            subject_hint=subject_hint,
            profile_hint=profile_hint,
            generation_goal_type=generation_goal_type,
            idempotency_key=idempotency_key,
            idempotency_request_hash=request_hash if idempotency_key is not None else None,
            free_ai_use_date=spent_day,
        )
        self.db.add(plan)
        try:
            self.db.commit()
        except Exception as exc:
            self.db.rollback()
            if spent_day is not None:  # no plan row holds the use: give it back now
                _refund_use(self.db, user_id, spent_day)
            if idempotency_key is None or not isinstance(exc, IntegrityError):
                raise
            winner = self._find_idempotent_plan(user_id, idempotency_key)
            if winner is None:
                raise
            return self._check_idempotency_payload(
                winner, request_hash, legacy_v2_request_hash
            ), False
        self.db.refresh(plan)
        return plan, True

    def _require_indexed_documents(self, user_id: int, document_ids: list[int]) -> None:
        """Only the caller's INDEXED documents can back a plan.

        Checked in the same session that inserts the plan; without it, a plan
        built from missing, foreign or unindexed documents would still reach
        READY with generic content (retrieval silently finds nothing).
        """
        if not document_ids:
            raise PlanDocumentsUnavailableError(
                "Selecciona al menos un documento indexado para generar el plan.", []
            )
        owned = DocumentRepository(self.db).find_for_user(user_id, document_ids)
        problems: list[tuple[int, str]] = []
        for document_id in document_ids:
            document = owned.get(document_id)
            if document is None:
                problems.append((document_id, "no existe"))
            elif document.status == DocumentStatus.PENDING:
                problems.append((document_id, "aún se está indexando"))
            elif document.status != DocumentStatus.INDEXED:
                problems.append((document_id, "no se pudo indexar"))
        if problems:
            listed = ", ".join(f"{document_id} ({reason})" for document_id, reason in problems)
            raise PlanDocumentsUnavailableError(
                f"No se puede generar el plan con estos documentos: {listed}. "
                "Selecciona documentos indexados.",
                [document_id for document_id, _ in problems],
            )

    @staticmethod
    def _idempotency_request_hash(
        goal_id: int,
        document_ids: list[int],
        *,
        content_version: int = 1,
        subject_hint: str | None = None,
        profile_hint: str | None = None,
        generation_goal_type: str | None = None,
    ) -> str:
        canonical_payload = {
            "goal_id": goal_id,
            "document_ids": sorted(set(document_ids)),
        }
        if content_version == 2:
            effective_profile_hint = profile_hint or {
                "history": "critical_argumentative",
                "mathematics": "logical_deductive",
                "general": "general",
                "auto": "auto",
            }.get(subject_hint or "auto", "auto")
            canonical_payload.update(
                {"content_version": 2, "profile_hint": effective_profile_hint}
            )
            if generation_goal_type is not None:
                canonical_payload["generation_goal_type"] = generation_goal_type
        encoded = json.dumps(canonical_payload, sort_keys=True, separators=(",", ":")).encode()
        return hashlib.sha256(encoded).hexdigest()

    def _find_idempotent_plan(self, user_id: int, idempotency_key: str) -> Plan | None:
        return self.db.execute(
            select(Plan).where(
                Plan.user_id == user_id,
                Plan.idempotency_key == idempotency_key,
            )
        ).scalar_one_or_none()

    @staticmethod
    def _check_idempotency_payload(
        plan: Plan, request_hash: str, legacy_v2_request_hash: str | None = None
    ) -> Plan:
        matches_current = plan.idempotency_request_hash == request_hash
        matches_legacy_v2 = (
            legacy_v2_request_hash is not None
            and plan.content_version == 2
            and plan.generation_goal_type is None
            and plan.idempotency_request_hash == legacy_v2_request_hash
        )
        if not matches_current and not matches_legacy_v2:
            raise ConflictError(
                "La clave de idempotencia ya se utilizó con una solicitud diferente.",
                "IDEMPOTENCY_KEY_REUSED",
            )
        return plan

    def get_plan(self, user_id: int, plan_id: int) -> Plan:
        plan = self.repo.find_by_id(plan_id)
        if plan is None or plan.user_id != user_id:
            raise NotFoundError("Plan no encontrado.")
        return plan

    def resume_plan(self, user_id: int, plan_id: int) -> tuple[Plan, bool]:
        """FAILED → PROCESSING; returns ``(plan, start_task)``. The generator does only what is missing."""
        plan = self.get_plan(user_id, plan_id)
        # Claim the plan before touching the quota (FreeAiQuota commits on its own),
        # so a double POST starts one task and spends one use.
        claimed = self.db.execute(
            update(Plan)
            .where(Plan.id == plan_id, Plan.status == PlanStatus.FAILED)
            .values(status=PlanStatus.PROCESSING)
        )
        self.db.commit()
        if claimed.rowcount == 0:
            self.db.refresh(plan)
            if plan.status == PlanStatus.PROCESSING:
                return plan, False  # idempotent replay
            raise ConflictError(
                "Solo se puede continuar un plan cuya generación quedó incompleta.",
                "PLAN_NOT_RESUMABLE",
            )

        spent_day = None
        try:
            if uses_free_ai(self.db, user_id):
                spent_day = FreeAiQuota(self.db).consume(user_id)
                self.db.execute(update(Plan).where(Plan.id == plan_id).values(free_ai_use_date=spent_day))
                self.db.commit()
        except Exception:
            # No task will run: hand the plan back as it was (FAILED, same message) and the use too.
            self.db.rollback()
            if spent_day is not None:
                _refund_use(self.db, user_id, spent_day)
            try:
                self.db.execute(
                    update(Plan)
                    .where(Plan.id == plan_id, Plan.status == PlanStatus.PROCESSING)
                    .values(status=PlanStatus.FAILED, free_ai_use_date=None)
                )
                self.db.commit()
            except Exception:  # noqa: BLE001 - startup recovery fails it if even this cannot be written
                self.db.rollback()
                logger.warning("Could not hand plan %s back as FAILED after a refused resume", plan_id)
            raise
        self.db.refresh(plan)
        return plan, True

    def list_plans(self, user_id: int) -> list[Plan]:
        return self.repo.list_for_user(user_id)

    def delete_plan(self, user_id: int, plan_id: int) -> None:
        plan = self.get_plan(user_id, plan_id)
        # FlashcardReview isn't part of the Plan -> Session -> Quiz -> QuizQuestion
        # ORM cascade (it points *at* a question, not owned by it), and SQLite
        # here never enforces `ondelete="CASCADE"` — without this, deleting a
        # plan would leave orphaned reviews haunting the dashboard's upcoming-
        # review counts.
        question_ids = self.db.execute(
            select(QuizQuestion.id)
            .join(Quiz, QuizQuestion.quiz_id == Quiz.id)
            .join(StudySession, Quiz.session_id == StudySession.id)
            .where(StudySession.plan_id == plan.id)
        ).scalars().all()
        if question_ids:
            self.db.execute(
                delete(FlashcardReview).where(FlashcardReview.question_id.in_(question_ids))
            )
        # Same reason: assistant messages only hold the plan id, nothing cascades to them.
        self.db.execute(delete(AssistantMessage).where(AssistantMessage.plan_id == plan.id))
        self.repo.delete(plan)


def _refund_use(db: Session, user_id: int, day: date) -> None:
    """Give back a use that no plan row holds (the request failed before or while saving it)."""
    try:
        FreeAiQuota(db).refund(user_id, day)
    except Exception:  # noqa: BLE001 - bookkeeping must never hide the real outcome
        db.rollback()
        logger.warning("Could not refund the free AI use for user %s", user_id)


def _refund_plan_use(db: Session, plan_id: int, user_id: int, fallback_day: date | None) -> None:
    """Give back the free use this plan spent, exactly once and on the day it was spent."""
    try:
        exists = db.scalar(select(Plan.id).where(Plan.id == plan_id)) is not None
        if not exists:  # deleted mid-run: nobody else can refund it
            if fallback_day is not None:
                FreeAiQuota(db).refund(user_id, fallback_day)
            return
        day = db.scalar(select(Plan.free_ai_use_date).where(Plan.id == plan_id))
        if day is None:
            return
        cleared = db.execute(
            update(Plan).where(Plan.id == plan_id, Plan.free_ai_use_date == day).values(free_ai_use_date=None)
        )
        db.commit()
        if cleared.rowcount == 1:
            FreeAiQuota(db).refund(user_id, day)
    except Exception:  # noqa: BLE001 - bookkeeping must never hide the real outcome
        db.rollback()
        logger.warning("Could not refund the free AI use for plan %s", plan_id)


_INTERRUPTED_MESSAGE = (
    "La generación se interrumpió porque el servidor se reinició. "
    "Pulsa «Continuar generación» para terminarla."
)


def recover_interrupted_plans(db: Session) -> None:
    """At startup, a PROCESSING plan has no live task left: make it resumable and refund it.

    Assumes a single backend process (the SQLite MVP); with several workers this would
    fail the live generations of the others.
    """
    interrupted = db.execute(
        select(Plan.id, Plan.user_id).where(Plan.status == PlanStatus.PROCESSING)
    ).all()
    for plan_id, user_id in interrupted:
        db.execute(
            update(Plan)
            .where(Plan.id == plan_id, Plan.status == PlanStatus.PROCESSING)
            .values(status=PlanStatus.FAILED, error_message=_INTERRUPTED_MESSAGE)
        )
        db.commit()
        _refund_plan_use(db, plan_id, user_id, None)
    if interrupted:
        logger.warning("Marked %d interrupted plan generation(s) as resumable", len(interrupted))


def generate_plan_task(plan_id: int) -> None:
    """Background worker that generates the full plan content."""
    db = SessionLocal()
    try:
        _Generator(db).run(plan_id)
    finally:
        db.close()


def _as_number(value, default, kind):
    """Models write numbers as text ("3", "0.8") or as words ("media"); fall back on the latter."""
    try:
        return kind(float(value))
    except (TypeError, ValueError):
        return default


def _explicit_profile_hint(plan: Plan) -> str | None:
    profile_hint = plan.profile_hint
    if profile_hint is not None and profile_hint.strip().casefold() != "auto":
        return profile_hint

    subject_hint = plan.subject_hint
    if subject_hint is not None and subject_hint.strip().casefold() != "auto":
        return subject_hint
    return None


def _topic_profile_bloom_levels(plan: Plan) -> dict[str, list[str]]:
    explicit_hint = _explicit_profile_hint(plan)
    if explicit_hint is not None:
        profile = resolve_profile(explicit_hint, None)
        return {profile.id: list(profile.bloom_levels)}

    profiles = {
        profile_id: list(resolve_profile(None, profile_id).bloom_levels)
        for profile_id in _CANONICAL_TOPIC_PROFILES
    }
    general = resolve_profile("general", None)
    profiles["general"] = list(general.bloom_levels)
    return profiles


class _PlanGone(Exception):
    """The plan was deleted (or left PROCESSING) while it was being generated."""


class _Generator:
    """Encapsulates the multi-step generation so ``generate_plan_task`` stays thin.

    The same run generates and resumes: it works out what is missing from the rows
    already stored, and every step ends in its own guarded commit.
    """

    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()
        self.retriever = Retriever()
        self.llm: LLMProvider | None = None
        self.recorder: UsageRecorder | None = None

    def run(self, plan_id: int) -> None:
        plan = self.db.get(Plan, plan_id)
        if plan is None or plan.status != PlanStatus.PROCESSING:
            logger.warning("generate_plan_task: plan %s not found or not processing", plan_id)
            return
        user_id, spent_day = plan.user_id, plan.free_ai_use_date
        try:
            self.llm = get_llm_provider(self.db, user_id)
            self.recorder = UsageRecorder(user_id=user_id, plan_id=plan_id)
            self._generate(plan)
            self._finish(plan_id)
        except _PlanGone:
            self.db.rollback()
            _refund_plan_use(self.db, plan_id, user_id, spent_day)
        except Exception as exc:  # noqa: BLE001 - record a safe failure for the client
            # A failed flush leaves the session usable only for a rollback.
            self.db.rollback()
            upstream_status = None
            if isinstance(exc, LLMError):
                error_message = str(exc)
                error_code = exc.code
                upstream_status = exc.upstream_status
            else:
                error_message = "No se pudo generar el plan. Inténtalo de nuevo."
                error_code = "PLAN_GENERATION_FAILED"
            logger.error(
                "Plan generation failed for plan %s (code=%s, upstream_status=%s, error_type=%s)",
                plan_id,
                error_code,
                upstream_status,
                type(exc).__name__,
            )
            self._fail(plan_id, error_message[:1000])
            _refund_plan_use(self.db, plan_id, user_id, spent_day)
        finally:
            if self.llm is not None:
                self.llm.close()

    def _generate(self, plan: Plan) -> None:
        goal = self.db.get(Goal, plan.goal_id)
        goal_text = f"{goal.title}. {goal.description}".strip()
        strategy_type = goal.goal_type
        if plan.content_version == 2 and plan.generation_goal_type is not None:
            strategy_type = GoalType(plan.generation_goal_type)
        strategy = GoalStrategyFactory.create(strategy_type)
        config = strategy.get_session_config()
        document_ids = (
            plan.document_ids
            if plan.content_version == 2
            else plan.document_ids or None
        )

        # Relationships are not refreshed when rows are added, so work on local lists.
        topics = list(plan.topics)
        if not topics:
            self._set_progress(plan.id, GenerationStage.TOPICS, 0, 0)
            # Kept modest (8 chunks * ~500 tokens each): a smaller prompt is one
            # less thing to hit a token-throughput limit on.
            chunks = (
                self.retriever.retrieve_texts(
                    goal_text or goal.title, top_k=8, document_ids=document_ids
                )
                if plan.content_version != 2 or document_ids
                else []
            )
            keywords = extract_keywords("\n".join(chunks), limit=8)
            topics_data = self._analyse_topics(
                goal_text, strategy, chunks, keywords, plan=plan
            )
            if not topics_data:  # never a READY plan with no sessions
                raise LLMError("La IA no devolvió temas para tu material.", code="LLM_INVALID_RESPONSE")
            topics = self._persist_topics(plan, topics_data)
            self._select(topics)
            if plan.content_version == 2:
                self._set_progress(
                    plan.id, GenerationStage.TOPICS, len(topics), len(topics)
                )
        elif plan.content_version == 2 and any(
            topic.pedagogy_snapshot is None for topic in topics
        ):
            raise LLMError(
                "El plan adaptativo no contiene una instantánea válida para cada tema.",
                code="LLM_INVALID_RESPONSE",
            )
        elif not any(topic.selected for topic in topics):
            self._select(topics)
        selected = [topic for topic in topics if topic.selected]

        sessions = sorted(
            (s for s in plan.sessions if s.kind == SessionKind.NEW), key=lambda s: s.order_index
        )
        if not sessions:
            self._set_progress(plan.id, GenerationStage.SESSIONS, 0, 0)
            sessions = self._create_sessions(plan, self._plan_sessions(goal_text, selected), config, start=0)
        else:
            # Older plans have sessions without topic_id, so match by name too.
            covered_ids = {s.topic_id for s in sessions if s.topic_id is not None}
            covered_names = {normalize(s.topic_name) for s in sessions}
            missing = [
                t for t in selected if t.id not in covered_ids and normalize(t.name) not in covered_names
            ]
            if missing:
                specs = self._link_sessions_to_topics([], missing, self.settings.REVIEW_INTERVALS_DAYS)
                start = max(s.order_index for s in sessions) + 1
                sessions += self._create_sessions(plan, specs, config, start=start)

        total = len(sessions)
        published_v2_session_ids: set[int] = set()
        session_snapshots: dict[int, PedagogySnapshot] = {}
        if plan.content_version == 2:
            session_snapshots = {
                session.id: self._topic_snapshot_for_session(session, topics)
                for session in sessions
            }
            for session in sessions:
                if self._has_complete_adaptive_content(
                    session, config, session_snapshots[session.id]
                ):
                    published_v2_session_ids.add(session.id)
            done = len(published_v2_session_ids)
        else:
            done = sum(1 for session in sessions if session.material is not None)
        self._set_progress(plan.id, GenerationStage.CONTENT, done, total)
        for session in sessions:
            if plan.content_version == 2:
                if session.id in published_v2_session_ids:
                    continue
                topic_chunks = (
                    self.retriever.retrieve_texts(
                        session.topic_name, top_k=4, document_ids=document_ids
                    )
                    if document_ids
                    else []
                )
                self._attach_session_content(
                    session,
                    session.topic_name,
                    goal_text,
                    topic_chunks,
                    config,
                    snapshot=session_snapshots[session.id],
                )
            else:
                if session.material is not None:
                    continue
                topic_chunks = self.retriever.retrieve_texts(
                    session.topic_name, top_k=4, document_ids=document_ids
                )
                self._attach_session_content(
                    session, session.topic_name, goal_text, topic_chunks, config
                )
            done += 1
            self._set_progress(plan.id, GenerationStage.CONTENT, done, total)

    def _topic_snapshot_for_session(
        self, session: StudySession, topics: list[PlanTopic]
    ) -> PedagogySnapshot:
        if session.topic_id is not None:
            topic = next((item for item in topics if item.id == session.topic_id), None)
        else:
            matches = [
                item
                for item in topics
                if normalize(item.name) == normalize(session.topic_name)
            ]
            topic = matches[0] if len(matches) == 1 else None
        if topic is None or topic.pedagogy_snapshot is None:
            raise LLMError(
                "El plan adaptativo no tiene una instantánea válida para esta sesión.",
                code="LLM_INVALID_RESPONSE",
            )
        try:
            return PedagogySnapshot.model_validate(topic.pedagogy_snapshot)
        except (PydanticValidationError, TypeError, ValueError) as exc:
            raise LLMError(
                "El plan adaptativo no tiene una instantánea válida para esta sesión.",
                code="LLM_INVALID_RESPONSE",
            ) from exc

    def _has_complete_adaptive_content(
        self,
        session: StudySession,
        config,
        snapshot: PedagogySnapshot,
    ) -> bool:
        if session.material is None and session.quiz is None:
            return False
        if session.material is None or session.quiz is None:
            raise LLMError(
                "La sesión adaptativa contiene una publicación incompleta.",
                code="LLM_INVALID_RESPONSE",
            )
        try:
            draft = AdaptiveContentRepository(self.db).get(session.id)
        except (PydanticValidationError, TypeError, ValueError) as exc:
            raise LLMError(
                "La sesión adaptativa contiene una publicación inválida.",
                code="LLM_INVALID_RESPONSE",
            ) from exc
        if draft is None or not draft.assessment_revision or draft.assessment_state is None:
            raise LLMError(
                "La sesión adaptativa contiene una publicación incompleta.",
                code="LLM_INVALID_RESPONSE",
            )
        stored_snapshot = draft.pedagogy_snapshot
        objective_ids = {objective.id for objective in snapshot.objectives}
        flashcards = [
            question
            for question in session.quiz.questions
            if question.question_type == QuestionType.FLASHCARD
        ]
        mapped_flashcards = {
            question_id: objectives
            for question_id, objectives in draft.adaptive_assessment.question_objectives.items()
            if question_id.startswith("legacy:")
        }
        lesson_objectives = {
            objective_id
            for block in draft.lesson_blocks
            for objective_id in block.objective_ids
        }
        assessment_objectives = {
            objective_id
            for question in draft.adaptive_assessment.questions
            for objective_id in question.objective_ids
        }
        if (
            not isinstance(stored_snapshot, PedagogySnapshot)
            or stored_snapshot.model_dump(mode="json") != snapshot.model_dump(mode="json")
            or len(session.quiz.questions) != config.flashcards
            or len(flashcards) != config.flashcards
            or len(draft.adaptive_assessment.questions) != config.multiple_choice
            or any(
                not mapped_flashcards.get(f"legacy:{question.id}")
                or not set(mapped_flashcards[f"legacy:{question.id}"]).issubset(objective_ids)
                for question in flashcards
            )
            or lesson_objectives != objective_ids
            or assessment_objectives != objective_ids
        ):
            raise LLMError(
                "La sesión adaptativa contiene una publicación incompleta.",
                code="LLM_INVALID_RESPONSE",
            )
        return True

    def _set_progress(self, plan_id: int, stage: GenerationStage, done: int, total: int) -> None:
        """Commit the step so far, unless the plan was deleted meanwhile."""
        self.db.flush()  # autoflush is off: an UPDATE would not write pending rows first
        result = self.db.execute(
            update(Plan)
            .where(Plan.id == plan_id, Plan.status == PlanStatus.PROCESSING)
            .values(progress_stage=stage, progress_done=done, progress_total=total)
        )
        if result.rowcount == 0:
            raise _PlanGone
        self.db.commit()

    def _finish(self, plan_id: int) -> None:
        result = self.db.execute(
            update(Plan)
            .where(Plan.id == plan_id, Plan.status == PlanStatus.PROCESSING)
            .values(status=PlanStatus.READY, error_message="", free_ai_use_date=None)
        )
        if result.rowcount == 0:
            raise _PlanGone
        self.db.commit()

    def _fail(self, plan_id: int, message: str) -> None:
        self.db.execute(
            update(Plan)
            .where(Plan.id == plan_id, Plan.status == PlanStatus.PROCESSING)
            .values(status=PlanStatus.FAILED, error_message=message)
        )
        self.db.commit()

    def _select(self, topics: list[PlanTopic]) -> None:
        """Pareto selection of the high-value slice of topics."""
        selected_ids = {t.id for t in select_top_by_relevance(topics, relevance=lambda t: t.relevance)}
        for topic in topics:
            topic.selected = topic.id in selected_ids
        self.db.flush()

    # --- steps ---------------------------------------------------------------
    def _llm_call(self, *, kind: str, escalate: bool = True, **kwargs) -> str:
        """Wraps ``self.llm.complete`` with proactive inter-call pacing.

        A rate-limited free-tier provider (OpenRouter's ~8 req/min, etc.) can
        be exceeded by this pipeline's own normal call volume alone — this
        spaces successive calls out instead of relying solely on reactive
        retry-on-429. Skipped for the mock provider so local dev/tests stay
        instant.
        """
        result = complete_within_budget(
            self.llm, kind=kind, escalate=escalate, before_retry=self._pace, recorder=self.recorder, **kwargs
        )
        self._pace()
        return result

    def _pace(self) -> None:
        pacing = self.settings.LLM_REQUEST_PACING_SECONDS
        if pacing > 0 and self.llm.requires_request_pacing:
            time.sleep(pacing)

    def _analyse_topics(
        self, goal_text, strategy, chunks, keywords, *, plan: Plan
    ) -> list[dict]:
        adaptive = plan.content_version == 2
        prompt = (
            topic_analysis.build_topic_analysis_prompt(
                chunks,
                goal_text,
                adaptive=adaptive,
                profile_hint=plan.profile_hint,
                subject_hint=plan.subject_hint,
                profile_bloom_levels=(
                    _topic_profile_bloom_levels(plan) if adaptive else None
                ),
            )
            + "\n\n"
            + strategy.get_weighting_prompt()
        )
        context = {"goal_title": goal_text, "keywords": keywords}
        if adaptive:
            context.update(
                {
                    "content_version": 2,
                    "profile_hint": plan.profile_hint,
                    "subject_hint": plan.subject_hint,
                }
            )
        raw = self._llm_call(
            kind="topic_analysis",
            system=topic_analysis.SYSTEM,
            prompt=prompt,
            context=context,
        )
        topics = parse_llm_json(raw).get("topics", [])
        if not isinstance(topics, list):
            raise LLMError("El proveedor de IA devolvió una respuesta inválida.", code="LLM_INVALID_RESPONSE")
        # Small models sometimes answer a bare name instead of an object.
        return [item if isinstance(item, dict) else {"name": item} for item in topics if item]

    def _persist_topics(self, plan: Plan, topics_data: list[dict]) -> list[PlanTopic]:
        topics: list[PlanTopic] = []
        for item in topics_data:
            subtopics = item.get("subtopics") or []
            pedagogy_snapshot = None
            if plan.content_version == 2:
                pedagogy_snapshot = self._snapshot_topic_pedagogy(plan, item)
            topic = PlanTopic(
                plan_id=plan.id,
                name=str(item.get("name") or "Tema")[:255],
                subtopics=[str(s) for s in subtopics] if isinstance(subtopics, list) else [str(subtopics)],
                difficulty=min(max(_as_number(item.get("difficulty"), 3, int), 1), 5),
                relevance=min(max(_as_number(item.get("relevance"), 0.5, float), 0.0), 1.0),
                pedagogy_snapshot=(
                    pedagogy_snapshot.model_dump(mode="json")
                    if pedagogy_snapshot is not None
                    else None
                ),
            )
            self.db.add(topic)
            topics.append(topic)
        self.db.flush()
        return topics

    @staticmethod
    def _snapshot_topic_pedagogy(plan: Plan, item: dict) -> PedagogySnapshot:
        objectives_data = item.get("objectives")
        if not isinstance(objectives_data, list) or not 1 <= len(objectives_data) <= 3:
            raise LLMError(
                "El proveedor de IA devolvió un tema adaptativo con objetivos inválidos.",
                code="LLM_INVALID_RESPONSE",
            )

        try:
            objectives = [
                LearningObjective.model_validate(objective)
                for objective in objectives_data
            ]
            objective_ids = [objective.id for objective in objectives]
            if len(objective_ids) != len(set(objective_ids)):
                raise ValueError("Learning objective identifiers must be unique per topic.")
            candidate = item.get("topic_profile")
            if (
                not isinstance(candidate, str)
                or candidate not in _CANONICAL_TOPIC_PROFILES
            ):
                candidate = None
            profile = resolve_profile(
                _explicit_profile_hint(plan), candidate
            )
            return snapshot_profile(profile, objectives)
        except (PydanticValidationError, TypeError, ValueError) as exc:
            raise LLMError(
                "El proveedor de IA devolvió metadatos pedagógicos inválidos.",
                code="LLM_INVALID_RESPONSE",
            ) from exc

    def _plan_sessions(self, goal_text: str, selected: list[PlanTopic]) -> list[dict]:
        intervals = self.settings.REVIEW_INTERVALS_DAYS
        prompt = plan_generation.build_plan_generation_prompt(
            topics=[
                {"name": t.name, "difficulty": t.difficulty, "relevance": t.relevance}
                for t in selected
            ],
            goal=goal_text,
            intervals=intervals,
            session_minutes=self.settings.SESSION_DURATION_MINUTES,
        )
        try:
            raw = self._llm_call(
                kind="session_plan",
                escalate=False,
                system=plan_generation.SYSTEM,
                prompt=prompt,
                context={"topics": [t.name for t in selected]},
            )
            sessions = parse_llm_json(raw).get("sessions", [])
        except LLMError as exc:
            if exc.code not in {"LLM_INVALID_RESPONSE", "LLM_OUTPUT_LIMIT"}:
                raise
            logger.warning("Session plan output was unusable (code=%s); using deterministic layout.", exc.code)
            sessions = []
        except (TypeError, ValueError, KeyError):
            sessions = []

        if not sessions:
            sessions = [
                {"topic_name": t.name, "review_offset_days": intervals[i % len(intervals)]}
                for i, t in enumerate(selected)
            ]
        return self._link_sessions_to_topics(sessions, selected, intervals)

    @staticmethod
    def _link_sessions_to_topics(
        sessions: list, selected: list[PlanTopic], intervals: list[int]
    ) -> list[dict]:
        """Exactly one NEW session per selected topic, linked by id.

        The LLM may rename, duplicate, invent or forget topics: names are matched
        normalized, strays are dropped and forgotten topics are appended.
        """
        by_key = {normalize(t.name): t for t in selected}
        seen: set[int] = set()
        out: list[dict] = []
        for spec in sessions:
            if not isinstance(spec, dict):
                continue
            topic = by_key.get(normalize(str(spec.get("topic_name", ""))))
            if topic is None or topic.id in seen:
                continue
            seen.add(topic.id)
            out.append({**spec, "topic_name": topic.name, "topic_id": topic.id})
        for topic in selected:
            if topic.id not in seen:
                out.append(
                    {
                        "topic_name": topic.name,
                        "topic_id": topic.id,
                        "review_offset_days": intervals[len(out) % len(intervals)],
                    }
                )
        return out

    def _create_sessions(self, plan, specs, config, *, start: int) -> list[StudySession]:
        """Every NEW session row of the plan, without content yet."""
        created = plan.created_at or datetime.now(timezone.utc)
        sessions: list[StudySession] = []
        for offset, spec in enumerate(specs):
            index = start + offset
            session = StudySession(
                plan_id=plan.id,
                order_index=index,
                topic_name=str(spec.get("topic_name", f"Tema {index + 1}"))[:255],
                duration_minutes=config.duration_minutes,
                review_offset_days=int(
                    spec.get("review_offset_days", self.settings.REVIEW_INTERVALS_DAYS[0])
                ),
                kind=SessionKind.NEW,
                topic_id=spec.get("topic_id"),
                scheduled_date=created.date() + timedelta(days=index),
            )
            self.db.add(session)
            sessions.append(session)
        self.db.flush()
        return sessions

    def _attach_session_content(
        self,
        session,
        topic_name,
        goal_text,
        chunks,
        config,
        *,
        snapshot: PedagogySnapshot | None = None,
    ) -> None:
        """One merged call for study material + quiz (was two calls)."""
        if snapshot is not None:
            self._attach_adaptive_session_content(
                session, topic_name, goal_text, chunks, config, snapshot
            )
            return

        raw = self._llm_call(
            kind="session_content",
            system=session_content.SYSTEM,
            prompt=session_content.build_session_content_prompt(
                topic_name, goal_text, chunks, config.flashcards, config.multiple_choice
            ),
            context={
                "topic": topic_name,
                "goal_title": goal_text,
                "flashcards": config.flashcards,
                "multiple_choice": config.multiple_choice,
            },
        )
        content = build_session_content(parse_llm_json(raw), config)

        self.db.add(
            SessionMaterial(
                session_id=session.id,
                content_markdown=content.material_markdown,
                youtube_keywords=content.keywords,
            )
        )
        quiz = Quiz(session_id=session.id)
        self.db.add(quiz)
        self.db.flush()
        for question in content.questions:
            self.db.add(QuizQuestion(quiz_id=quiz.id, **question))

    def _attach_adaptive_session_content(
        self,
        session: StudySession,
        topic_name: str,
        goal_text: str,
        chunks: list[str],
        config,
        snapshot: PedagogySnapshot,
    ) -> None:
        """Build and atomically publish one validated v2 lesson and assessment."""
        sources = adaptive_session_content.index_source_chunks(chunks)
        raw = self._llm_call(
            kind="session_content",
            system=adaptive_session_content.SYSTEM,
            prompt=adaptive_session_content.build_adaptive_session_prompt(
                topic_name, goal_text, sources, config, snapshot
            ),
            context={
                "content_version": 2,
                "pedagogy_snapshot": snapshot.model_dump(mode="json"),
                "sources": sources,
                "topic": topic_name,
                "goal_title": goal_text,
                "flashcards": config.flashcards,
                "multiple_choice": config.multiple_choice,
            },
        )
        content = build_adaptive_session_content(
            parse_llm_json(raw), config, snapshot, sources
        )

        self.db.add(
            SessionMaterial(
                session_id=session.id,
                content_markdown=content.content_markdown,
                youtube_keywords=content.keywords,
            )
        )
        quiz = Quiz(session_id=session.id)
        self.db.add(quiz)
        self.db.flush()

        flashcard_questions: list[QuizQuestion] = []
        for index, card in enumerate(content.flashcards):
            question = QuizQuestion(
                quiz_id=quiz.id,
                order_index=index,
                question_type=QuestionType.FLASHCARD,
                prompt=card["prompt"],
                answer=card["answer"],
                options=[],
            )
            self.db.add(question)
            flashcard_questions.append(question)
        self.db.flush()

        question_objectives = {
            f"legacy:{question.id}": card["objective_ids"]
            for question, card in zip(flashcard_questions, content.flashcards, strict=True)
        }
        draft = content.draft.model_copy(
            update={
                "adaptive_assessment": content.draft.adaptive_assessment.model_copy(
                    update={"question_objectives": question_objectives}
                )
            }
        )
        AdaptiveContentRepository(self.db).save(session.id, draft)
