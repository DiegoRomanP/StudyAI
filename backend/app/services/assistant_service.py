"""Study assistant: one LLM call per message, history kept per session.

STUDY explains doubts with the session material; EXAM gives hints only. The answer key of a
question never reaches the prompt, so the model has nothing to leak.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import LLMError
from app.llm.factory import resolve_llm_provider
from app.llm.output_budget import complete_within_budget
from app.llm.prompts import assistant as assistant_prompt
from app.models.assistant_message import AssistantMessage, AssistantMode, AssistantRole
from app.models.plan import Plan
from app.models.session import Session as StudySession
from app.rag.retriever import Retriever
from app.repositories.adaptive_content_repository import AdaptiveContentRepository
from app.schemas.assistant import (
    AssistantAskRequest,
    AssistantAskResponse,
    AssistantHistoryResponse,
    AssistantMessageResponse,
    AssistantQuestionItem,
)
from app.services.free_ai_quota import FreeAiQuota
from app.services.session_service import SessionService
from app.services.usage_recorder import UsageRecorder

_RETRIEVED_CHUNKS = 4


class AssistantService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def history(self, user_id: int, session_id: int) -> AssistantHistoryResponse:
        session = SessionService(self.db).get_session(user_id, session_id)
        rows = self.db.scalars(
            select(AssistantMessage)
            .where(AssistantMessage.session_id == session.id, AssistantMessage.user_id == user_id)
            .order_by(AssistantMessage.id)
        ).all()
        return AssistantHistoryResponse(
            messages=[AssistantMessageResponse.model_validate(row) for row in rows],
            remaining=self._remaining(user_id, self._bundled(user_id)),
        )

    def ask(self, user_id: int, session_id: int, payload: AssistantAskRequest) -> AssistantAskResponse:
        session = SessionService(self.db).get_session(user_id, session_id)
        exam_question = (
            self._exam_question(session, payload.question_id) if payload.mode == AssistantMode.EXAM else None
        )
        history = self.db.scalars(
            select(AssistantMessage)
            .where(AssistantMessage.session_id == session.id, AssistantMessage.user_id == user_id)
            .order_by(AssistantMessage.id.desc())
            .limit(assistant_prompt.MAX_HISTORY)
        ).all()
        plan = session.plan
        chunks = (
            Retriever().retrieve_texts(payload.message, top_k=_RETRIEVED_CHUNKS, document_ids=plan.document_ids)
            if plan.document_ids
            else []
        )
        prompt = assistant_prompt.build_assistant_prompt(
            mode=payload.mode.value,
            topic=session.topic_name,
            material=session.material.content_markdown if session.material else "",
            chunks=chunks,
            history=[(row.role.value, row.content) for row in reversed(history)],
            question=payload.message,
            exam_question=exam_question,
        )

        resolution = resolve_llm_provider(self.db, user_id)
        llm, bundled = resolution.provider, resolution.runtime.bundled
        quota = FreeAiQuota(self.db, assistant=True)
        spent_day = quota.consume(user_id) if bundled else None
        try:
            reply = complete_within_budget(
                llm,
                recorder=UsageRecorder(user_id=user_id, plan_id=plan.id, session_id=session.id),
                kind="assistant_chat",
                system=assistant_prompt.SYSTEM,
                prompt=prompt,
                context={"mode": payload.mode.value, "topic": session.topic_name, "message": payload.message},
            ).strip()
            if not reply:
                raise LLMError("La IA no devolvió una respuesta.", code="LLM_INVALID_RESPONSE")
        except Exception:
            if spent_day is not None:
                quota.refund(user_id, spent_day)
            raise
        finally:
            llm.close()

        question, answer = (
            AssistantMessage(
                user_id=user_id, plan_id=plan.id, session_id=session.id,
                mode=payload.mode, role=role, content=content,
            )
            for role, content in ((AssistantRole.USER, payload.message), (AssistantRole.ASSISTANT, reply))
        )
        self.db.add_all([question, answer])
        self.db.commit()
        return AssistantAskResponse(
            question=AssistantMessageResponse.model_validate(question),
            answer=AssistantMessageResponse.model_validate(answer),
            remaining=self._remaining(user_id, bundled),
        )

    def questions(self, user_id: int, plan_id: int | None = None) -> list[AssistantQuestionItem]:
        """Each learner question with the reply that followed it, newest first."""
        query = (
            select(AssistantMessage, StudySession.topic_name, Plan.title)
            .join(StudySession, StudySession.id == AssistantMessage.session_id)
            .join(Plan, Plan.id == AssistantMessage.plan_id)
            .where(AssistantMessage.user_id == user_id, Plan.user_id == user_id)
            .order_by(AssistantMessage.session_id, AssistantMessage.id)
        )
        if plan_id is not None:
            query = query.where(AssistantMessage.plan_id == plan_id)
        items: list[AssistantQuestionItem] = []
        pending: tuple[AssistantMessage, str, str] | None = None
        for message, topic_name, plan_title in self.db.execute(query).all():
            if message.role == AssistantRole.USER:
                pending = (message, topic_name, plan_title)
            elif pending is not None and pending[0].session_id == message.session_id:
                asked, topic, title = pending
                items.append(AssistantQuestionItem(
                    id=asked.id, plan_id=asked.plan_id, plan_title=title, session_id=asked.session_id,
                    topic_name=topic, mode=asked.mode, question=asked.content, answer=message.content,
                    created_at=asked.created_at,
                ))
                pending = None
        return sorted(items, key=lambda item: item.id, reverse=True)

    def _exam_question(self, session: StudySession, question_id: str | None) -> str | None:
        """Prompt and options of the question on screen; never its answer."""
        if not question_id:
            return None
        legacy = question_id.removeprefix("legacy:")
        if legacy.isdigit() and session.quiz is not None:
            question = next((q for q in session.quiz.questions if q.id == int(legacy)), None)
            if question is not None:
                return _format_question(question.prompt, question.options or [])
        draft = AdaptiveContentRepository(self.db).get(session.id)
        if draft is not None:
            stored = next(
                (q for q in draft.adaptive_assessment.questions if q.question_id == question_id), None
            )
            if stored is not None:
                return _format_question(stored.prompt, stored.options)
        return None

    def _bundled(self, user_id: int) -> bool:
        resolution = resolve_llm_provider(self.db, user_id)
        resolution.provider.close()
        return resolution.runtime.bundled

    def _remaining(self, user_id: int, bundled: bool) -> int | None:
        return FreeAiQuota(self.db, assistant=True).status(user_id).remaining if bundled else None


def _format_question(prompt: str, options: list[str]) -> str:
    listed = "\n".join(f"- {option}" for option in options)
    return f"{prompt}\nOpciones:\n{listed}" if listed else prompt
