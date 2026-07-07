"""Plan generation orchestrator.

Coordinates the whole AI pipeline for a plan:
    1. Retrieve relevant chunks (RAG).
    2. LLM call #1 — topic analysis.
    3. Pareto-select the highest-relevance topics.
    4. LLM call #2 — distribute topics into spaced sessions.
    5. LLM calls #3 — per-session study material + quiz.

The public API is small: ``create_plan`` (synchronous, returns a PROCESSING
plan) and ``generate_plan_task`` (the background worker that fills it in).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.algorithms.pareto import select_top_by_relevance
from app.llm.factory import get_llm_provider
from app.llm.output_parsers import parse_llm_json
from app.llm.prompts import content_gen, plan_generation, quiz_gen, topic_analysis
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
        self.llm = get_llm_provider()
        self.retriever = Retriever()

    def run(self, plan_id: int) -> None:
        plan = self.db.get(Plan, plan_id)
        if plan is None:
            logger.warning("generate_plan_task: plan %s not found", plan_id)
            return
        try:
            self._generate(plan)
            plan.status = PlanStatus.READY
        except Exception as exc:  # noqa: BLE001 - record failure for the client
            logger.exception("Plan generation failed for plan %s", plan_id)
            plan.status = PlanStatus.FAILED
            plan.error_message = str(exc)[:1000]
        self.db.add(plan)
        self.db.commit()

    def _generate(self, plan: Plan) -> None:
        goal = self.db.get(Goal, plan.goal_id)
        goal_text = f"{goal.title}. {goal.description}".strip()
        strategy = GoalStrategyFactory.create(goal.goal_type)
        config = strategy.get_session_config()

        # 1. Retrieve representative chunks for the whole goal.
        chunks = self.retriever.retrieve_texts(
            goal_text or goal.title, top_k=12, document_ids=plan.document_ids or None
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
    def _analyse_topics(self, goal_text, strategy, chunks, keywords) -> list[dict]:
        prompt = (
            topic_analysis.build_topic_analysis_prompt(chunks, goal_text)
            + "\n\n"
            + strategy.get_weighting_prompt()
        )
        raw = self.llm.complete(
            kind="topic_analysis",
            system=topic_analysis.SYSTEM,
            prompt=prompt,
            context={"goal_title": goal_text, "keywords": keywords},
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
            raw = self.llm.complete(
                kind="session_plan",
                system=plan_generation.SYSTEM,
                prompt=prompt,
                context={"topics": [t.name for t in selected]},
            )
            sessions = parse_llm_json(raw).get("sessions", [])
        except Exception:  # noqa: BLE001 - degrade to a deterministic layout
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
        self._attach_material(session, topic_name, goal_text, topic_chunks)
        self._attach_quiz(session, topic_name, topic_chunks, config)

    def _attach_material(self, session, topic_name, goal_text, chunks) -> None:
        raw = self.llm.complete(
            kind="content",
            system=content_gen.SYSTEM,
            prompt=content_gen.build_content_prompt(topic_name, goal_text, chunks),
            context={"topic": topic_name, "goal_title": goal_text},
        )
        data = parse_llm_json(raw)
        material = SessionMaterial(
            session_id=session.id,
            content_markdown=str(data.get("summary_markdown", "")),
            youtube_keywords=list(data.get("youtube_keywords", []) or []),
        )
        self.db.add(material)

    def _attach_quiz(self, session, topic_name, chunks, config) -> None:
        raw = self.llm.complete(
            kind="quiz",
            system=quiz_gen.SYSTEM,
            prompt=quiz_gen.build_quiz_prompt(topic_name, chunks),
            context={"topic": topic_name},
        )
        data = parse_llm_json(raw)
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
