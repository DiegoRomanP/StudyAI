"""Typed public DTOs for opt-in subject-adaptive learning v2."""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr, model_validator

from app.pedagogy.contracts import (
    AssessmentMatchingItem,
    AssessmentMatchingPair,
    AssessmentRubricCriterion,
    AssessmentSequenceItem,
    GroundedAssessmentFeedback,
    LessonBlock,
    LegacyPedagogySnapshot,
    MinuteRange,
    PedagogySnapshot,
    ProcedureRubricWeights,
)
from app.pedagogy.stimuli import Stimulus


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
    stimuli: list[Stimulus] = Field(default_factory=list)


class _AssessmentQuestionBase(_StrictDTO):
    question_id: str
    prompt: str
    objective_ids: list[str]
    estimated_minutes_per_question: MinuteRange | None = None
    stimulus_id: str | None = None


class FlashcardQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["flashcard"]
    # Flashcards intentionally retain their reveal interaction.
    flashcard_answer: str


class MultipleChoiceQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["multiple_choice"]
    mode: Literal["single", "multiple"] = "single"
    options: list[str]


class TrueFalseQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["true_false"]


class MatchingQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["matching"]
    matching_left: list[AssessmentMatchingItem]
    matching_right: list[AssessmentMatchingItem]


class NumericQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["numeric"]
    units: str | None = None


class SequenceQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["sequence"]
    sequence_items: list[AssessmentSequenceItem]


class RubricQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["rubric"]
    rubric_criteria: list[AssessmentRubricCriterion]


class ShortAnswerQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["short_answer"]
    grading_mode: Literal["exact", "formative"]


class EssayQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["essay"]


class StepByStepQuestionResponseV2(_AssessmentQuestionBase):
    kind: Literal["step_by_step"]
    grading_mode: Literal["exact", "numeric", "formative"]


AssessmentQuestionV2 = Annotated[
    Union[
        FlashcardQuestionResponseV2,
        MultipleChoiceQuestionResponseV2,
        TrueFalseQuestionResponseV2,
        MatchingQuestionResponseV2,
        NumericQuestionResponseV2,
        SequenceQuestionResponseV2,
        RubricQuestionResponseV2,
        ShortAnswerQuestionResponseV2,
        EssayQuestionResponseV2,
        StepByStepQuestionResponseV2,
    ],
    Field(discriminator="kind"),
]


class AssessmentResponseV2(_StrictDTO):
    quiz_id: int
    revision: str
    questions: list[AssessmentQuestionV2]
    stimuli: list[Stimulus] = Field(default_factory=list)


class FlashcardAnswerV2(_StrictDTO):
    kind: Literal["flashcard"]
    question_id: str = Field(min_length=1)
    quality: int = Field(ge=0, le=5)


class MultipleChoiceAnswerV2(_StrictDTO):
    kind: Literal["multiple_choice"]
    question_id: str = Field(min_length=1)
    selected_option: StrictStr | None = None
    selected_options: list[StrictStr] | None = Field(default=None, min_length=1, max_length=8)

    @model_validator(mode="after")
    def exactly_one_selection_shape(self) -> MultipleChoiceAnswerV2:
        if (self.selected_option is None) == (self.selected_options is None):
            raise ValueError("Provide either selected_option or selected_options.")
        if self.selected_option is not None and not self.selected_option:
            raise ValueError("selected_option cannot be empty.")
        if self.selected_options is not None and len(self.selected_options) != len(
            set(self.selected_options)
        ):
            raise ValueError("selected_options must be unique.")
        return self


class TrueFalseAnswerV2(_StrictDTO):
    kind: Literal["true_false"]
    question_id: str = Field(min_length=1)
    answer: StrictBool


class MatchingAnswerV2(_StrictDTO):
    kind: Literal["matching"]
    question_id: str = Field(min_length=1)
    pairs: list[AssessmentMatchingPair] = Field(min_length=2, max_length=8)

    @model_validator(mode="after")
    def pairs_form_a_bijection(self) -> MatchingAnswerV2:
        left_ids = [pair.left_id for pair in self.pairs]
        right_ids = [pair.right_id for pair in self.pairs]
        if len(set(left_ids)) != len(self.pairs) or len(set(right_ids)) != len(self.pairs):
            raise ValueError("A matching answer must use each left and right item once.")
        return self


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


class ShortAnswerAnswerV2(_StrictDTO):
    kind: Literal["short_answer"]
    question_id: str = Field(min_length=1)
    text: StrictStr = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def answer_is_not_blank(self) -> ShortAnswerAnswerV2:
        if not self.text.strip():
            raise ValueError("Answer text cannot be blank.")
        return self


class EssayAnswerV2(_StrictDTO):
    kind: Literal["essay"]
    question_id: str = Field(min_length=1)
    text: StrictStr = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def answer_is_not_blank(self) -> EssayAnswerV2:
        if not self.text.strip():
            raise ValueError("Answer text cannot be blank.")
        return self


class StepByStepAnswerV2(_StrictDTO):
    kind: Literal["step_by_step"]
    question_id: str = Field(min_length=1)
    steps: StrictStr = Field(default="", max_length=2000)
    final_answer: StrictStr = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def final_answer_is_not_blank(self) -> StepByStepAnswerV2:
        if not self.final_answer.strip():
            raise ValueError("Final answer cannot be blank.")
        return self


AssessmentAnswerV2 = Annotated[
    Union[
        FlashcardAnswerV2,
        MultipleChoiceAnswerV2,
        TrueFalseAnswerV2,
        MatchingAnswerV2,
        NumericAnswerV2,
        SequenceAnswerV2,
        RubricAnswerV2,
        ShortAnswerAnswerV2,
        EssayAnswerV2,
        StepByStepAnswerV2,
    ],
    Field(discriminator="kind"),
]


class AssessmentSubmissionV2(_StrictDTO):
    revision: str
    answers: list[AssessmentAnswerV2]


class AssessmentResultItemV2(_StrictDTO):
    question_id: str
    kind: Literal[
        "flashcard",
        "multiple_choice",
        "true_false",
        "matching",
        "numeric",
        "sequence",
        "short_answer",
        "essay",
        "step_by_step",
    ]
    correct: bool | None = None
    quality: int | None = None
    submitted_answer: (
        StrictBool | StrictStr | list[StrictStr] | list[AssessmentMatchingPair] | None
    ) = None
    expected_answer: (
        StrictBool | StrictStr | list[StrictStr] | list[AssessmentMatchingPair] | None
    ) = None
    feedback: str = ""
    grounded_feedback: list[GroundedAssessmentFeedback] = Field(default_factory=list)


class FormativeFeedbackV2(_StrictDTO):
    question_id: str
    criterion_ratings: dict[str, int] = Field(default_factory=dict)
    criteria: list[AssessmentRubricCriterion] = Field(default_factory=list)
    exemplar: str | None = None
    message: str
    submitted_text: StrictStr | None = Field(default=None, max_length=2000)
    submitted_final_answer: StrictStr | None = Field(default=None, max_length=2000)
    procedure_rubric_weights: ProcedureRubricWeights | None = None
    grounded_feedback: list[GroundedAssessmentFeedback] = Field(default_factory=list)


class ObjectiveResultV2(_StrictDTO):
    objective_id: str = Field(min_length=1)
    correct: int = Field(ge=0)
    total: int = Field(ge=1)

    @model_validator(mode="after")
    def correct_count_does_not_exceed_total(self) -> ObjectiveResultV2:
        if self.correct > self.total:
            raise ValueError("Correct answers cannot exceed the objective total.")
        return self


class AssessmentResultV2(_StrictDTO):
    quiz_id: int
    revision: str
    score: float = Field(ge=0, le=100)
    correct: int = Field(ge=0)
    total: int = Field(ge=0)
    detail: list[AssessmentResultItemV2]
    formative_feedback: list[FormativeFeedbackV2] = Field(default_factory=list)
    objective_results: list[ObjectiveResultV2] = Field(default_factory=list)
