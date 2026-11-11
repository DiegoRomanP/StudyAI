"""Validate the model's merged v2 lesson and assessment before publication."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
import re
from typing import Annotated
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter

from app.core.exceptions import LLMError
from app.llm.prompts.adaptive_session_content import PROFILE_LESSON_KINDS
from app.pedagogy.answer_normalization import parse_numeric_answer
from app.pedagogy.contracts import (
    AdaptiveAssessmentPayload,
    AdaptiveSessionDraft,
    AssessmentMatchingPair,
    FeedbackMode,
    GroundedAssessmentFeedback,
    LessonBlock,
    PedagogySnapshot,
    StoredAssessmentQuestion,
    validate_formative_rubric,
)
from app.pedagogy.stimuli import Body, Label, evidence_excerpt, has_source_heading, validate_stimuli
from app.strategies.base import SessionConfig

_Body = TypeAdapter(Body)
_Keyword = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
_FORMAT_ALIASES = {"numeric": "short_answer", "sequence": "matching", "rubric": "essay"}
_FORMULA = re.compile(r"\S\s*[=≈≠≤≥]\s*\S|\\(?:frac|sqrt)\s*\{")


class _Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _SourceCitation(_Input):
    source_id: str = Field(min_length=1, max_length=80)
    quote: str = Field(min_length=1, max_length=1000)


class _FeedbackCitation(_SourceCitation):
    mode: FeedbackMode
    heading: Label | None = None


class _LessonBlock(_Input):
    id: Label
    kind: Label
    objective_ids: list[str] = Field(min_length=1, max_length=12)
    content_markdown: Body
    source_citations: list[_SourceCitation] = Field(default_factory=list, max_length=4)
    stimulus_id: str | None = None


class _Flashcard(_Input):
    prompt: Label
    answer: Body
    objective_ids: list[str] = Field(min_length=1, max_length=12)


class _GeneratedContent(_Input):
    lesson_blocks: list[_LessonBlock] = Field(min_length=2, max_length=10)
    flashcards: list[_Flashcard] = Field(max_length=8)
    questions: list[dict] = Field(max_length=7)
    youtube_keywords: list[_Keyword] = Field(max_length=4)
    stimuli: list[dict] = Field(default_factory=list, max_length=12)


_FeedbackCitations = TypeAdapter(Annotated[list[_FeedbackCitation], Field(max_length=3)])


@dataclass(frozen=True)
class AdaptiveBuiltContent:
    content_markdown: str
    keywords: list[str]
    flashcards: list[dict]
    draft: AdaptiveSessionDraft


def _check_objectives(values: list[str], allowed: set[str]) -> None:
    if not values or len(values) != len(set(values)) or not set(values).issubset(allowed):
        raise ValueError("Expected distinct objective IDs from the session snapshot.")


def _lesson_blocks(
    blocks: list[_LessonBlock], snapshot: PedagogySnapshot, sources: Mapping[str, str], objective_ids: set[str]
) -> list[LessonBlock]:
    if not set(PROFILE_LESSON_KINDS[snapshot.profile_id]).issubset({block.kind for block in blocks}):
        raise ValueError("The lesson is missing one of its profile's teaching blocks.")
    if len({block.id for block in blocks}) != len(blocks):
        raise ValueError("Lesson block IDs must be unique.")
    result = []
    for block in blocks:
        _check_objectives(block.objective_ids, objective_ids)
        source_ids = []
        for citation in block.source_citations:
            evidence_excerpt(sources, citation.source_id, citation.quote)
            source_ids.append(citation.source_id)
        result.append(LessonBlock(
            id=block.id, kind=block.kind, objective_ids=block.objective_ids,
            content_markdown=block.content_markdown, stimulus_id=block.stimulus_id,
            source_refs=list(dict.fromkeys(source_ids)),
        ))
    if {id_ for block in result for id_ in block.objective_ids} != objective_ids:
        raise ValueError("Every objective must appear in the lesson.")
    return result


def _grounded_feedback(
    raw: object, snapshot: PedagogySnapshot, sources: Mapping[str, str]
) -> list[GroundedAssessmentFeedback]:
    entries = _FeedbackCitations.validate_python(raw)
    modes = {entry.mode for entry in entries}
    if len(modes) != len(entries) or not modes.issubset(snapshot.feedback_modes):
        raise ValueError("Feedback modes must be unique and permitted by the profile.")
    result = []
    for entry in entries:
        excerpt = _Body.validate_python(evidence_excerpt(sources, entry.source_id, entry.quote))
        reference = "Revisa este fragmento del material."
        if entry.mode == "chapter_reference" and entry.heading and has_source_heading(
            sources[entry.source_id], entry.heading
        ):
            reference = f"Revisa el apartado «{entry.heading}»."
        elif entry.mode == "formula":
            if _FORMULA.search(excerpt) is None:
                continue
            reference = "Revisa la fórmula con este fragmento del material."
        elif entry.mode == "counterargument":
            reference = "Contrasta tu respuesta con este fragmento del material."
        result.append(GroundedAssessmentFeedback(
            mode=entry.mode, text=f"{reference}\n{excerpt}", source_id=entry.source_id,
        ))
    return result


def _remap_presentation_ids(question: StoredAssessmentQuestion) -> StoredAssessmentQuestion:
    if question.kind == "sequence":
        ids = {item.id: uuid4().hex for item in question.sequence_items}
        return question.model_copy(update={
            "sequence_items": [item.model_copy(update={"id": ids[item.id]}) for item in question.sequence_items],
            "expected_answer": [ids[id_] for id_ in question.expected_answer],
        })
    if question.kind == "matching":
        left = {item.id: uuid4().hex for item in question.matching_left}
        right = {item.id: uuid4().hex for item in question.matching_right}
        return question.model_copy(update={
            "matching_left": [item.model_copy(update={"id": left[item.id]}) for item in question.matching_left],
            "matching_right": [item.model_copy(update={"id": right[item.id]}) for item in question.matching_right],
            "matching_pairs": [
                AssessmentMatchingPair(left_id=left[pair.left_id], right_id=right[pair.right_id])
                for pair in question.matching_pairs
            ],
        })
    return question


def _assessment_questions(
    questions: list[dict], snapshot: PedagogySnapshot, sources: Mapping[str, str], objective_ids: set[str]
) -> list[StoredAssessmentQuestion]:
    result = []
    for raw in questions:
        fields = dict(raw)
        citations = fields.pop("feedback", [])
        fields["question_id"] = f"adaptive:{uuid4().hex}"
        fields["prompt"] = _Body.validate_python(fields.get("prompt"))
        question = StoredAssessmentQuestion.model_validate(fields)
        _check_objectives(question.objective_ids, objective_ids)
        format_ = _FORMAT_ALIASES.get(question.kind, question.kind)
        allowed = format_ in snapshot.allowed_question_types
        if question.kind == "rubric":
            allowed = allowed or "step_by_step" in snapshot.allowed_question_types
            validate_formative_rubric(question.rubric_criteria)
        if not allowed:
            raise ValueError("The question format is not configured for this profile.")
        if question.kind == "numeric":
            if not isinstance(question.expected_answer, str):
                raise ValueError("Numeric questions require an exact key.")
            parse_numeric_answer(question.expected_answer)
        question = _remap_presentation_ids(question)
        question.feedback = _grounded_feedback(citations, snapshot, sources)
        result.append(question)
    if {id_ for question in result for id_ in question.objective_ids} != objective_ids:
        raise ValueError("Every objective must appear in an assessment question.")
    if not any(q.kind not in {"essay", "rubric"} and q.grading_mode != "formative" for q in result):
        raise ValueError("The assessment requires an objective question.")
    return result


def build_adaptive_session_content(
    data: dict, config: SessionConfig, snapshot: PedagogySnapshot, sources: Mapping[str, str]
) -> AdaptiveBuiltContent:
    try:
        raw = _GeneratedContent.model_validate(data)
        if len(raw.flashcards) != config.flashcards or len(raw.questions) != config.multiple_choice:
            raise ValueError("Question counts must match the goal strategy.")
        objective_ids = {item.id for item in snapshot.objectives}
        if not objective_ids or len(objective_ids) != len(snapshot.objectives):
            raise ValueError("The snapshot requires distinct learning objectives.")
        for card in raw.flashcards:
            _check_objectives(card.objective_ids, objective_ids)
        blocks = _lesson_blocks(raw.lesson_blocks, snapshot, sources, objective_ids)
        questions = _assessment_questions(raw.questions, snapshot, sources, objective_ids)
        stimuli = validate_stimuli(raw.stimuli, sources, objective_ids)
        # The same validator also applies when a draft is loaded again from storage.
        draft = AdaptiveSessionDraft(
            pedagogy_snapshot=snapshot,
            lesson_blocks=blocks,
            adaptive_assessment=AdaptiveAssessmentPayload(
                schema_version=2, question_objectives={}, questions=questions, stimuli=stimuli,
            ),
            assessment_revision=uuid4().hex,
            assessment_state="open",
        )
        return AdaptiveBuiltContent(
            content_markdown="\n\n".join(block.content_markdown for block in blocks),
            keywords=[_Body.validate_python(keyword) for keyword in raw.youtube_keywords],
            flashcards=[card.model_dump() for card in raw.flashcards],
            draft=draft,
        )
    except ValueError as exc:
        raise LLMError(
            "La IA no devolvió una lección y una evaluación adaptativas válidas.",
            code="LLM_INVALID_RESPONSE",
        ) from exc
