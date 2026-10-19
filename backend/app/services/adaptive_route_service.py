"""Adaptive route: what an exam changes in the study plan.

Subscribed to ``session.completed``. After a graded first attempt it updates the
topic's mastery and review box, and schedules (at most) one pending REVIEW
session per topic, built deterministically from the exam — no LLM calls.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.algorithms.adaptive_route import (
    DOMINADO,
    effective_ladder,
    exam_score,
    failed_question_ids,
    normalize,
    order_for_review,
    review_interval_days,
    shuffled_options,
    topic_state,
    update_topic,
)
from app.core.config import get_settings
from app.core.logging import get_logger
from app.events.session_events import SESSION_COMPLETED, SessionCompletedEvent, event_bus
from app.models.plan import Plan, PlanTopic
from app.models.quiz import QuestionType, Quiz, QuizQuestion, QuizResult
from app.models.session import Session as StudySession
from app.models.session import SessionKind, SessionMaterial, SessionStatus

logger = get_logger(__name__)


def _today() -> date:
    return datetime.now(timezone.utc).date()


def handle_session_completed(event: SessionCompletedEvent) -> None:
    # POST /complete has no exam and a retake must not move the route.
    if event.quiz_result_id is None or not event.first_completion:
        return
    AdaptiveRouteService(event.db).apply_exam(event.session_id, event.quiz_result_id)


def register_handlers() -> None:
    event_bus.subscribe(SESSION_COMPLETED, handle_session_completed)


class AdaptiveRouteService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def apply_exam(self, session_id: int, quiz_result_id: int) -> None:
        session = self.db.get(StudySession, session_id)
        result = self.db.get(QuizResult, quiz_result_id)
        if session is None or result is None:
            return
        topic = self._resolve_topic(session)
        if topic is None:
            logger.info("Session %s has no matching plan topic; route unchanged", session_id)
            return
        detail = result.detail or {}
        score = exam_score(detail)
        if score is None:
            return

        today = _today()
        ladder = effective_ladder(get_settings().REVIEW_INTERVALS_DAYS)
        promote = (
            session.kind == SessionKind.NEW
            or session.scheduled_date is None
            or today >= session.scheduled_date
        )
        topic.mastery, topic.review_box = update_topic(
            topic.mastery, topic.review_box, score, promote_allowed=promote, ladder=ladder
        )
        if topic_state(topic.mastery, topic.review_box) == DOMINADO:
            self.db.flush()
            return

        interval = review_interval_days(topic.review_box, ladder)
        failed = failed_question_ids(detail)
        source_questions = self._questions(session)
        points = [
            {"prompt": q.prompt, "answer": q.answer} for q in source_questions if q.id in failed
        ]
        pending = self.db.scalars(
            select(StudySession).where(
                StudySession.plan_id == session.plan_id,
                StudySession.topic_id == topic.id,
                StudySession.kind == SessionKind.REVIEW,
                StudySession.status == SessionStatus.PENDING,
                StudySession.id != session.id,
            )
        ).first()
        if pending is not None:
            # Only legacy plans can get here: never more than one pending review per topic.
            pending.scheduled_date = today + timedelta(days=interval)
            pending.review_offset_days = interval
            pending.review_points = points
            self.db.flush()
            return

        self.db.add(self._build_review(session, topic, result, source_questions, points, interval, today))
        self.db.flush()

    def _resolve_topic(self, session: StudySession) -> PlanTopic | None:
        if session.topic_id:
            topic = self.db.get(PlanTopic, session.topic_id)
            return topic if topic is not None and topic.plan_id == session.plan_id else None
        # Plans created before the adaptive route only know the topic by name.
        plan = self.db.get(Plan, session.plan_id)
        if plan is None:
            return None
        key = normalize(session.topic_name)
        candidates = [t for t in plan.topics if normalize(t.name) == key]
        if not candidates:
            return None
        best = max(candidates, key=lambda t: (t.selected, t.relevance))
        session.topic_id = best.id
        return best

    @staticmethod
    def _questions(session: StudySession) -> list[QuizQuestion]:
        return sorted(session.quiz.questions, key=lambda q: q.order_index) if session.quiz else []

    def _build_review(
        self,
        source: StudySession,
        topic: PlanTopic,
        result: QuizResult,
        questions: list[QuizQuestion],
        points: list[dict],
        interval: int,
        today: date,
    ) -> StudySession:
        by_id = {q.id: q for q in questions}
        ids = order_for_review([q.id for q in questions], failed_question_ids(result.detail or {}))
        copies = [
            QuizQuestion(
                order_index=index,
                question_type=by_id[question_id].question_type,
                prompt=by_id[question_id].prompt,
                answer=by_id[question_id].answer,
                options=(
                    shuffled_options(by_id[question_id].options or [], f"{result.id}:{question_id}")
                    if by_id[question_id].question_type == QuestionType.MULTIPLE_CHOICE
                    else []
                ),
                source_question_id=by_id[question_id].source_question_id or question_id,
            )
            for index, question_id in enumerate(ids)
        ]
        max_order = self.db.scalar(
            select(func.max(StudySession.order_index)).where(StudySession.plan_id == source.plan_id)
        )
        material = source.material
        return StudySession(
            plan_id=source.plan_id,
            order_index=(max_order if max_order is not None else -1) + 1,
            topic_name=topic.name,
            topic_id=topic.id,
            kind=SessionKind.REVIEW,
            duration_minutes=source.duration_minutes,
            review_offset_days=interval,
            scheduled_date=today + timedelta(days=interval),
            review_points=points,
            material=SessionMaterial(
                content_markdown=material.content_markdown if material else "",
                youtube_keywords=list(material.youtube_keywords or []) if material else [],
            ),
            quiz=Quiz(questions=copies),
        )
