"""Quiz DTOs."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.models.quiz import QuestionType


class QuizQuestionResponse(BaseModel):
    """Question as delivered to the client.

    ``answer`` is intentionally included so the flashcard flip and MC feedback
    can happen client-side in the MVP (grading is also verified server-side on
    submit). Harden this later by withholding answers until submission.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int
    question_type: QuestionType
    prompt: str
    options: list[str]
    answer: str


class QuizResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    questions: list[QuizQuestionResponse]


class QuizAnswer(BaseModel):
    question_id: int
    # For multiple-choice: the chosen option string.
    selected_option: str | None = None
    # For flashcards: the learner's SM-2 self-rating 0..5.
    quality: int | None = Field(default=None, ge=0, le=5)


class QuizSubmission(BaseModel):
    answers: list[QuizAnswer]


class QuizResultResponse(BaseModel):
    score: float
    correct: int
    total: int
    detail: dict
