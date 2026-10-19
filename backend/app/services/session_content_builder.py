"""Turns the LLM's ``session_content`` JSON into study material and quiz questions.

Shared by plan generation and AI reinforcement, so both honour the goal strategy's
exact flashcard / multiple-choice counts the same way.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.quiz import QuestionType
from app.strategies.base import SessionConfig


@dataclass(frozen=True)
class SessionContent:
    material_markdown: str
    keywords: list[str]
    # Dicts with the QuizQuestion fields: flashcards first, then multiple choice.
    questions: list[dict]


def build_session_content(data: dict, config: SessionConfig) -> SessionContent:
    questions: list[dict] = []
    for card in (data.get("flashcards") or [])[: config.flashcards]:
        questions.append(
            {
                "order_index": len(questions),
                "question_type": QuestionType.FLASHCARD,
                "prompt": str(card.get("question", "")),
                "answer": str(card.get("answer", "")),
                "options": [],
            }
        )
    for mc in (data.get("multiple_choice") or [])[: config.multiple_choice]:
        questions.append(
            {
                "order_index": len(questions),
                "question_type": QuestionType.MULTIPLE_CHOICE,
                "prompt": str(mc.get("question", "")),
                "answer": str(mc.get("answer", "")),
                "options": list(mc.get("options", []) or []),
            }
        )
    return SessionContent(
        material_markdown=str(data.get("summary_markdown", "")),
        keywords=list(data.get("youtube_keywords", []) or []),
        questions=questions,
    )
