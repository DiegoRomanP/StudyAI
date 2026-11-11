"""Typed public DTOs for opt-in subject-adaptive learning v2."""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

from app.pedagogy.contracts import (
    AssessmentRubricCriterion,
    AssessmentSequenceItem,
    LessonBlock,
    LegacyPedagogySnapshot,
    PedagogySnapshot,
)


class _StrictDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LearningModeResponse(_StrictDTO):
    content_version: Literal[1, 2]


class LearningResponseV2(_StrictDTO):
    session_id: int
    content_version: Literal[2] = 2
    snapshot: PedagogySnapshot | LegacyPedagogySnapshot
    lesson_blocks: list[LessonBlock]
    content_markdown: str


class _AssessmentQuestionBase(_StrictDTO):
    question_id: str
    prompt: str
    objective_ids: list[str]


class FlashcardQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["flashcard"]
    # Flashcards intentionally retain their reveal interaction.
    flashcard_answer: str


class MultipleChoiceQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["multiple_choice"]
    options: list[str]


class NumericQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["numeric"]
    units: str | None = None


class SequenceQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["sequence"]
    sequence_items: list[AssessmentSequenceItem]


class RubricQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["rubric"]
    rubric_criteria: list[AssessmentRubricCriterion]


AssessmentQuestionV2 = Annotated[
    Union[
        FlashcardQuestionResponseV2,
        MultipleChoiceQuestionResponseV2,
        NumericQuestionResponseV2,
        SequenceQuestionResponseV2,
        RubricQuestionResponseV2,
    ],
    Field(discriminator="kind"),
]


class AssessmentResponseV2(_StrictDTO):
    quiz_id: int
    revision: str
    questions: list[AssessmentQuestionV2]


class FlashcardAnswerV2(_StrictDTO):
    kind: Literal["flashcard"]
    question_id: str = Field(min_length=1)
    quality: int = Field(ge=0, le=5)


class MultipleChoiceAnswerV2(_StrictDTO):
    kind: Literal["multiple_choice"]
    question_id: str = Field(min_length=1)
    selected_option: str


class NumericAnswerV2(_StrictDTO):
    kind: Literal["numeric"]
    question_id: str = Field(min_length=1)
    value: str = Field(max_length=64)


class SequenceAnswerV2(_StrictDTO):
    kind: Literal["sequence"]
    question_id: str = Field(min_length=1)
    ordered_ids: list[str]


class RubricAnswerV2(_StrictDTO):
    kind: Literal["rubric"]
    question_id: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=2000)
    criterion_ratings: dict[str, Annotated[int, Field(ge=0, le=2)]]


AssessmentAnswerV2 = Annotated[
    Union[
        FlashcardAnswerV2,
        MultipleChoiceAnswerV2,
        NumericAnswerV2,
        SequenceAnswerV2,
        RubricAnswerV2,
    ],
    Field(discriminator="kind"),
]


class AssessmentSubmissionV2(_StrictDTO):
    revision: str
    answers: list[AssessmentAnswerV2]


class AssessmentResultItemV2(_StrictDTO):
    question_id: str
    kind: Literal["flashcard", "multiple_choice", "numeric", "sequence"]
    correct: bool | None = None
    quality: int | None = None
    submitted_answer: str | list[str] | None = None
    expected_answer: str | list[str] | None = None
    feedback: str = ""


class FormativeFeedbackV2(_StrictDTO):
    question_id: str
    criterion_ratings: dict[str, int]
    criteria: list[AssessmentRubricCriterion] = Field(default_factory=list)
    exemplar: str | None = None
    message: str


class AssessmentResultV2(_StrictDTO):
    quiz_id: int
    revision: str
    score: float = Field(ge=0, le=100)
    correct: int = Field(ge=0)
    total: int = Field(ge=0)
    detail: list[AssessmentResultItemV2]
    formative_feedback: list[FormativeFeedbackV2] = Field(default_factory=list)
