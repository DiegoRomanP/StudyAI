"""Validated pedagogy and adaptive-assessment persistence contracts."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ContractModel(BaseModel):
    """Reject undeclared persisted or public contract fields."""

    model_config = ConfigDict(extra="forbid", revalidate_instances="always")


class LearningObjective(ContractModel):
    id: str = Field(min_length=1)
    skill: str = Field(min_length=1)
    description: str = Field(min_length=1)


class PedagogyProfile(ContractModel):
    id: Literal["history", "mathematics", "general"]
    version: int = Field(ge=1)
    rules: list[str]


class PedagogySnapshot(ContractModel):
    profile_id: Literal["history", "mathematics", "general"]
    profile_version: int = Field(ge=1)
    rules: list[str]
    objectives: list[LearningObjective]


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
    rubric_criteria: list[AssessmentRubricCriterion] = Field(default_factory=list)
    units: str | None = None
    expected_answer: str | list[str] | None = None
    exemplar: str | None = None


class AdaptiveAssessmentPayload(ContractModel):
    """Validated v2 alignment plus additional questions and private solutions."""

    schema_version: Literal[2]
    question_objectives: dict[str, list[str]]
    questions: list[StoredAssessmentQuestion]


class AdaptiveSessionDraft(ContractModel):
    pedagogy_snapshot: PedagogySnapshot
    lesson_blocks: list[LessonBlock]
    adaptive_assessment: AdaptiveAssessmentPayload
    assessment_revision: str | None = None
    assessment_state: Literal["open", "submitted"] | None = None


class ObjectiveGrade(ContractModel):
    correct: bool
    feedback: str


class ObjectiveTotals(ContractModel):
    correct: int = Field(ge=0)
    total: int = Field(ge=0)
    score: float = Field(ge=0, le=100)
