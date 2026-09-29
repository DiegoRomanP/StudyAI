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

import time

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import LLMError, NotFoundError
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.algorithms.pareto import select_top_by_relevance
from app.llm.factory import get_llm_provider
from app.llm.mock_provider import MockLLMProvider
from app.llm.output_parsers import parse_llm_json
from app.llm.prompts import plan_generation, session_content, topic_analysis
from app.models.flashcard import FlashcardReview
from app.models.goal import Goal
from app.models.plan import Plan, PlanStatus, PlanTopic
from app.models.quiz import QuestionType, Quiz, QuizQuestion
from app.models.session import Session as StudySession
from app.models.session import SessionMaterial
from app.repositories.plan_repository import PlanRepository
from app.rag.retriever import Retriever
from app.strategies.goal_strategies import GoalStrategyFactory
from app.utils.text import extract_keywords

logger = get_logger(__name__)


class PlanService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = PlanRepository(db)

    def create_plan(self, user_id: int, goal_id: int, document_ids: list[int]) -> Plan:
        goal = self.db.get(Goal, goal_id)
        if goal is None or goal.user_id != user_id:
            raise NotFoundError("Meta no encontrada.")
        plan = Plan(
            user_id=user_id,
            goal_id=goal_id,
            title=f"Plan: {goal.title}",
            status=PlanStatus.PROCESSING,
            document_ids=list(document_ids),
        )
        return self.repo.save(plan)

    def get_plan(self, user_id: int, plan_id: int) -> Plan:
        plan = self.repo.find_by_id(plan_id)
        if plan is None or plan.user_id != user_id:
            raise NotFoundError("Plan no encontrado.")
        return plan

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
        self.repo.delete(plan)


def generate_plan_task(plan_id: int) -> None:
    """Background worker that generates the full plan content."""
    db = SessionLocal()
    try:
        _Generator(db).run(plan_id)
    finally:
        db.close()


class _Generator:
    """Encapsulates the multi-step generation so ``generate_plan_task`` stays thin."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()
        self.retriever = Retriever()

    def run(self, plan_id: int) -> None:
        plan = self.db.get(Plan, plan_id)
        if plan is None:
            logger.warning("generate_plan_task: plan %s not found", plan_id)
            return
        self.llm = get_llm_provider(self.db, plan.user_id)
        try:
            self._generate(plan)
            plan.status = PlanStatus.READY
        except Exception as exc:  # noqa: BLE001 - record a safe failure for the client
            upstream_status = None
            if isinstance(exc, LLMError):
                error_message = str(exc)
                error_code = exc.code
                upstream_status = exc.upstream_status
            else:
                error_message = "No se pudo generar el plan. Inténtalo de nuevo."
                error_code = "PLAN_GENERATION_FAILED"
            logger.error(
                "Plan generation failed for plan %s (code=%s, upstream_status=%s)",
                plan_id,
                error_code,
                upstream_status,
            )
            plan.status = PlanStatus.FAILED
            plan.error_message = error_message
        finally:
            self.llm.close()
        self.db.add(plan)
        self.db.commit()

    def _generate(self, plan: Plan) -> None:
        goal = self.db.get(Goal, plan.goal_id)
        goal_text = f"{goal.title}. {goal.description}".strip()
        strategy = GoalStrategyFactory.create(goal.goal_type)
        config = strategy.get_session_config()

        # 1. Retrieve representative chunks for the whole goal. Kept modest
        # (8 chunks * ~500 tokens each) rather than the wider 12 previously
        # used — a smaller prompt is one less thing to hit a token-throughput
        # limit on, on top of the request-count reductions below.
        chunks = self.retriever.retrieve_texts(
            goal_text or goal.title, top_k=8, document_ids=plan.document_ids or None
        )
        keywords = extract_keywords("\n".join(chunks), limit=8)

        # 2. LLM call #1 — topic analysis.
        topics_data = self._analyse_topics(goal_text, strategy, chunks, keywords)
        topics = self._persist_topics(plan, topics_data)

        # 3. Pareto selection.
        selected = select_top_by_relevance(topics, relevance=lambda t: t.relevance)
        selected_ids = {t.id for t in selected}
        for topic in topics:
            topic.selected = topic.id in selected_ids
        self.db.flush()

        # 4. LLM call #2 — session distribution (fallback to derived if empty).
        session_specs = self._plan_sessions(goal_text, selected)

        # 5. Per-session material + quiz.
        for index, spec in enumerate(session_specs):
            self._build_session(plan, index, spec, goal_text, config)

        self.db.flush()

    # --- steps ---------------------------------------------------------------
    def _llm_call(self, *, max_tokens: int, **kwargs) -> str:
        """Wraps ``self.llm.complete`` with proactive inter-call pacing.

        A rate-limited free-tier provider (OpenRouter's ~8 req/min, etc.) can
        be exceeded by this pipeline's own normal call volume alone — this
        spaces successive calls out instead of relying solely on reactive
        retry-on-429. Skipped for the mock provider so local dev/tests stay
        instant.
        """
        result = self.llm.complete(max_tokens=max_tokens, **kwargs)
        pacing = self.settings.LLM_REQUEST_PACING_SECONDS
        if pacing > 0 and self.llm.requires_request_pacing:
            time.sleep(pacing)
        return result

    def _analyse_topics(self, goal_text, strategy, chunks, keywords) -> list[dict]:
        prompt = (
            topic_analysis.build_topic_analysis_prompt(chunks, goal_text)
            + "\n\n"
            + strategy.get_weighting_prompt()
        )
        raw = self._llm_call(
            kind="topic_analysis",
            system=topic_analysis.SYSTEM,
            prompt=prompt,
            context={"goal_title": goal_text, "keywords": keywords},
            # Up to ~10 topics with 2-3 subtopics each fits comfortably well
            # under 1536 tokens; far less than the previous blanket 4096.
            max_tokens=1536,
        )
        data = parse_llm_json(raw)
        return data.get("topics", [])

    def _persist_topics(self, plan: Plan, topics_data: list[dict]) -> list[PlanTopic]:
        topics: list[PlanTopic] = []
        for item in topics_data:
            topic = PlanTopic(
                plan_id=plan.id,
                name=str(item.get("name", "Tema"))[:255],
                subtopics=list(item.get("subtopics", []) or []),
                difficulty=int(item.get("difficulty", 3) or 3),
                relevance=float(item.get("relevance", 0.5) or 0.5),
            )
            self.db.add(topic)
            topics.append(topic)
        self.db.flush()
        return topics

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
                system=plan_generation.SYSTEM,
                prompt=prompt,
                context={"topics": [t.name for t in selected]},
                # Just a list of {topic_name, review_offset_days} per selected
                # topic — a few hundred tokens even for a dozen sessions.
                max_tokens=1024,
            )
            sessions = parse_llm_json(raw).get("sessions", [])
        except LLMError as exc:
            if exc.code != "LLM_INVALID_RESPONSE":
                raise
            logger.warning("Session plan output was invalid; using deterministic layout.")
            sessions = []
        except (TypeError, ValueError, KeyError):
            sessions = []

        if not sessions:
            sessions = [
                {"topic_name": t.name, "review_offset_days": intervals[i % len(intervals)]}
                for i, t in enumerate(selected)
            ]
        return sessions

    def _build_session(self, plan, index, spec, goal_text, config) -> None:
        topic_name = str(spec.get("topic_name", f"Tema {index + 1}"))[:255]
        offset = int(spec.get("review_offset_days", self.settings.REVIEW_INTERVALS_DAYS[0]))

        session = StudySession(
            plan_id=plan.id,
            order_index=index,
            topic_name=topic_name,
            duration_minutes=config.duration_minutes,
            review_offset_days=offset,
        )
        self.db.add(session)
        self.db.flush()

        topic_chunks = self.retriever.retrieve_texts(
            topic_name, top_k=4, document_ids=plan.document_ids or None
        )
        self._attach_session_content(session, topic_name, goal_text, topic_chunks, config)

    def _attach_session_content(self, session, topic_name, goal_text, chunks, config) -> None:
        """One merged call for study material + quiz (was two calls)."""
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
            # Markdown summary + a handful of flashcards/MC questions —
            # comfortably fits in far less than the previous 4096+4096.
            max_tokens=2048,
        )
        data = parse_llm_json(raw)

        material = SessionMaterial(
            session_id=session.id,
            content_markdown=str(data.get("summary_markdown", "")),
            youtube_keywords=list(data.get("youtube_keywords", []) or []),
        )
        self.db.add(material)

        quiz = Quiz(session_id=session.id)
        self.db.add(quiz)
        self.db.flush()

        order = 0
        for card in (data.get("flashcards") or [])[: config.flashcards]:
            self.db.add(
                QuizQuestion(
                    quiz_id=quiz.id,
                    order_index=order,
                    question_type=QuestionType.FLASHCARD,
                    prompt=str(card.get("question", "")),
                    answer=str(card.get("answer", "")),
                    options=[],
                )
            )
            order += 1
        for mc in (data.get("multiple_choice") or [])[: config.multiple_choice]:
            options = list(mc.get("options", []) or [])
            self.db.add(
                QuizQuestion(
                    quiz_id=quiz.id,
                    order_index=order,
                    question_type=QuestionType.MULTIPLE_CHOICE,
                    prompt=str(mc.get("question", "")),
                    answer=str(mc.get("answer", "")),
                    options=options,
                )
            )
            order += 1
