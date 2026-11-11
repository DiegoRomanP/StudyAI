"""Validated pedagogy and adaptive-assessment persistence contracts."""

from __future__ import annotations

from collections.abc import Mapping
from random import SystemRandom
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ModelWrapValidatorHandler, ValidationInfo, model_validator
from pydantic.json_schema import SkipJsonSchema

_STORED_CONTENT_CONTEXT = object()


class ContractModel(BaseModel):
    """Reject undeclared persisted or public contract fields."""

    model_config = ConfigDict(extra="forbid", revalidate_instances="always")


BloomLevel = Literal["remember", "understand", "apply", "analyze", "evaluate", "create"]
QuestionFormat = Literal[
    "multiple_choice", "true_false", "short_answer", "essay", "step_by_step", "matching"
]
EvaluationCriterion = Literal["accuracy", "procedure", "argumentation"]
FeedbackMode = Literal["formula", "chapter_reference", "counterargument"]
ProfileId = Literal[
    "logical_deductive",
    "critical_argumentative",
    "linguistic_interpretive",
    "systemic_empirical",
    "applied_practical",
    "general",
]


class MinuteRange(ContractModel):
    min: int = Field(gt=0, strict=True)
    max: int = Field(gt=0, strict=True)

    @model_validator(mode="after")
    def ordered_bounds(self) -> MinuteRange:
        if self.min > self.max:
            raise ValueError("Minimum minutes cannot exceed maximum minutes.")
        return self


class ProcedureRubricWeights(ContractModel):
    result: float = Field(gt=0, le=1)
    procedure: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def sum_to_one(self) -> ProcedureRubricWeights:
        if abs(self.result + self.procedure - 1.0) > 1e-9:
            raise ValueError("Procedure and result weights must sum to 1.")
        return self


class LearningObjective(ContractModel):
    id: str = Field(min_length=1)
    skill: str = Field(min_length=1)
    description: str = Field(min_length=1)
    bloom_target: BloomLevel


class LegacyLearningObjective(ContractModel):
    id: str = Field(min_length=1)
    skill: str = Field(min_length=1)
    description: str = Field(min_length=1)


class PedagogyConfiguration(ContractModel):
    name: str = Field(min_length=1)
    discipline_examples: list[str] = Field(default_factory=list)
    rules: list[str] = Field(min_length=1)
    bloom_levels: list[BloomLevel] = Field(min_length=1)
    allowed_question_types: list[QuestionFormat] = Field(min_length=1)
    primary_evaluation_criterion: EvaluationCriterion
    estimated_minutes_per_question: MinuteRange
    question_time_overrides: dict[QuestionFormat, MinuteRange] = Field(default_factory=dict)
    feedback_modes: list[FeedbackMode] = Field(min_length=1)
    procedure_rubric_weights: ProcedureRubricWeights | None = None

    @model_validator(mode="after")
    def unique_configuration_values(self) -> PedagogyConfiguration:
        profile_id = getattr(self, "id", getattr(self, "profile_id", None))
        if not self.discipline_examples and profile_id != "general":
            raise ValueError("Academic profiles must include discipline examples.")
        for field_name in (
            "discipline_examples",
            "rules",
            "bloom_levels",
            "allowed_question_types",
            "feedback_modes",
        ):
            values = getattr(self, field_name)
            if len(values) != len(set(values)):
                raise ValueError(f"{field_name} values must be unique.")
        if not set(self.question_time_overrides).issubset(self.allowed_question_types):
            raise ValueError("Question-time overrides must use allowed question formats.")
        return self


class PedagogyProfile(PedagogyConfiguration):
    id: ProfileId
    version: int = Field(ge=1)


class PedagogySnapshot(PedagogyConfiguration):
    snapshot_schema_version: Literal[2]
    profile_id: ProfileId
    profile_version: int = Field(ge=1)
    objectives: list[LearningObjective]

    @model_validator(mode="after")
    def objectives_use_configured_bloom_levels(self) -> PedagogySnapshot:
        configured = set(self.bloom_levels)
        if any(objective.bloom_target not in configured for objective in self.objectives):
            raise ValueError("Objective Bloom targets must be configured for this profile.")
        return self


class LegacyPedagogySnapshot(ContractModel):
    profile_id: Literal["history", "mathematics", "general"]
    profile_version: int = Field(ge=1)
    rules: list[str]
    objectives: list[LegacyLearningObjective]


def read_pedagogy_snapshot(
    raw: dict[str, object],
) -> PedagogySnapshot | LegacyPedagogySnapshot:
    """Read a complete v2 snapshot or preserve the historical id/version shape."""
    if "snapshot_schema_version" in raw:
        return PedagogySnapshot.model_validate(raw)
    return LegacyPedagogySnapshot.model_validate(raw)


class LessonBlock(ContractModel):
    id: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    objective_ids: list[str]
    content_markdown: str
    source_refs: list[str] = Field(default_factory=list)


class AssessmentSequenceItem(ContractModel):
    id: str = Field(min_length=1)
    text: str = Field(min_length=1)


class AssessmentRubricCriterion(ContractModel):
    criterion_id: str = Field(min_length=1)
    description: str = Field(min_length=1)
    descriptors: list[str] = Field(default_factory=list)


class StoredAssessmentQuestion(ContractModel):
    """Private v2 question data stored in ``Quiz.adaptive_assessment``."""

    question_id: str = Field(min_length=1)
    kind: Literal["numeric", "sequence", "rubric"]
    prompt: str = Field(min_length=1)
    objective_ids: list[str]
    options: list[str] = Field(default_factory=list)
    sequence_items: list[AssessmentSequenceItem] = Field(default_factory=list)
    sequence_presentation_initialized: SkipJsonSchema[bool] = False
    rubric_criteria: list[AssessmentRubricCriterion] = Field(default_factory=list)
    units: str | None = None
    expected_answer: str | list[str] | None = None
    exemplar: str | None = None

    @model_validator(mode="wrap")
    @classmethod
    def accept_presentation_marker_from_storage_only(
        cls,
        value: object,
        handler: ModelWrapValidatorHandler[StoredAssessmentQuestion],
        info: ValidationInfo,
    ) -> StoredAssessmentQuestion:
        if (
            isinstance(value, Mapping)
            and "sequence_presentation_initialized" in value
            and info.context is not _STORED_CONTENT_CONTEXT
        ):
            raise ValueError("Sequence presentation marker is storage-only.")
        return handler(value)

    @model_validator(mode="after")
    def keep_sequence_answer_private(self) -> StoredAssessmentQuestion:
        if self.kind != "sequence":
            return self

        expected_order = self.expected_answer
        item_ids = [item.id for item in self.sequence_items]
        if (
            not isinstance(expected_order, list)
            or len(item_ids) < 2
            or len(item_ids) != len(set(item_ids))
            or len(expected_order) != len(item_ids)
            or len(expected_order) != len(set(expected_order))
            or set(item_ids) != set(expected_order)
        ):
            raise ValueError(
                "Sequence questions require at least two unique items matching the answer order."
            )

        if not self.sequence_presentation_initialized:
            presentation_items = list(self.sequence_items)
            SystemRandom().shuffle(presentation_items)
            self.sequence_items = presentation_items
            self.sequence_presentation_initialized = True

        return self


class AdaptiveAssessmentPayload(ContractModel):
    """Validated v2 alignment plus additional questions and private solutions."""

    schema_version: Literal[2]
    question_objectives: dict[str, list[str]]
    questions: list[StoredAssessmentQuestion]


class AdaptiveSessionDraft(ContractModel):
    pedagogy_snapshot: PedagogySnapshot | LegacyPedagogySnapshot
    lesson_blocks: list[LessonBlock]
    adaptive_assessment: AdaptiveAssessmentPayload
    assessment_revision: str | None = None
    assessment_state: Literal["open", "submitted"] | None = None

    @classmethod
    def from_storage(cls, raw: dict[str, object]) -> AdaptiveSessionDraft:
        return cls.model_validate(raw, context=_STORED_CONTENT_CONTEXT)


class ObjectiveGrade(ContractModel):
    correct: bool
    feedback: str


class ObjectiveTotals(ContractModel):
    correct: int = Field(ge=0)
    total: int = Field(ge=0)
    score: float = Field(ge=0, le=100)
