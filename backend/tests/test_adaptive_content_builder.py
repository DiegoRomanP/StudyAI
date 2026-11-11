import pytest
from pydantic import ValidationError

from app.core.exceptions import LLMError
from app.llm.prompts.adaptive_session_content import (
    build_adaptive_session_prompt,
    index_source_chunks,
)
from app.pedagogy.contracts import LearningObjective
from app.pedagogy.registry import resolve_profile, snapshot_profile
from app.services.adaptive_content_builder import build_adaptive_session_content
from app.strategies.base import SessionConfig


CONFIG = SessionConfig(duration_minutes=20, flashcards=1, multiple_choice=2, emphasis="comprensión")
SOURCES = {"fragment-1": "## Desenlace\nLa segunda hipótesis contradice el relato inicial."}
RUBRIC = [{
    "criterion_id": "evidence", "description": "Contrasta las hipótesis.",
    "descriptors": ["Menciona un detalle del relato."],
}]


@pytest.fixture
def content():
    snapshot = snapshot_profile(resolve_profile("history", None), [
        LearningObjective(
            id="contrast", skill="fuentes", description="Contrastar testimonios", bloom_target="analyze"
        ),
    ])
    data = {
        "lesson_blocks": [
            {
                "id": "context", "kind": "context", "objective_ids": ["contrast"],
                "content_markdown": "Contexto del relato.",
                "source_citations": [{
                    "source_id": "fragment-1", "quote": "La segunda hipótesis contradice el relato inicial.",
                }],
                "stimulus_id": "fragment",
            },
            {
                "id": "compare", "kind": "source_comparison", "objective_ids": ["contrast"],
                "content_markdown": "Compara los testimonios.",
            },
        ],
        "flashcards": [{"prompt": "¿Qué contraste se plantea?", "answer": "Dos hipótesis.", "objective_ids": ["contrast"]}],
        "questions": [
            {
                "kind": "true_false", "prompt": "¿Los relatos coinciden?", "expected_answer": False,
                "objective_ids": ["contrast"], "stimulus_id": "fragment",
                "feedback": [{
                    "mode": "chapter_reference", "source_id": "fragment-1",
                    "quote": "La segunda hipótesis contradice el relato inicial.", "heading": "Desenlace",
                }],
            },
            {
                "kind": "essay", "prompt": "Contrasta los testimonios.", "objective_ids": ["contrast"],
                "rubric_criteria": RUBRIC, "exemplar": "Contraste desarrollado.",
            },
        ],
        "stimuli": [{
            "id": "fragment", "kind": "long_text", "title": "Testimonios", "objective_ids": ["contrast"],
            "origin": "derived", "source_id": "fragment-1",
            "evidence_quote": "La segunda hipótesis contradice el relato inicial.",
            "body_markdown": "La segunda hipótesis contradice el relato inicial.",
        }],
        "youtube_keywords": ["análisis de testimonios"],
    }
    return data, snapshot


def test_build_preserves_snapshot_alignment_and_private_feedback(content):
    raw, snapshot = content
    built = build_adaptive_session_content(raw, CONFIG, snapshot, SOURCES)
    draft = built.draft
    assert draft.pedagogy_snapshot == snapshot
    assert draft.assessment_state == "open"
    assert draft.assessment_revision
    assert "Contexto del relato." in built.content_markdown
    assert built.flashcards == raw["flashcards"]
    assert draft.lesson_blocks[0].source_refs == ["fragment-1"]
    assert draft.lesson_blocks[0].stimulus_id == "fragment"
    assessment = draft.adaptive_assessment
    assert assessment.stimuli[0].id == "fragment"
    assert assessment.questions[0].question_id.startswith("adaptive:")
    assert assessment.questions[0].feedback[0].source_id == "fragment-1"
    assert "Desenlace" in assessment.questions[0].feedback[0].text
    assert assessment.questions[1].exemplar == "Contraste desarrollado."
    assert "Contraste desarrollado." not in built.content_markdown


def test_chapter_reference_uses_verified_fragment_if_heading_is_missing(content):
    data, snapshot = content
    data["questions"][0]["feedback"][0]["heading"] = "Capítulo 98"
    result = build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)
    feedback = result.draft.adaptive_assessment.questions[0].feedback[0]
    assert "Capítulo 98" not in feedback.text
    assert "fragmento" in feedback.text
    assert "La segunda hipótesis contradice el relato inicial." in feedback.text


@pytest.mark.parametrize("invalid", [
    "count", "kind", "alignment", "feedback_mode", "feedback_quote", "stimulus", "block_source",
    "profile_blocks", "no_objective_question", "url_keyword", "reserved_marker", "blank_prompt",
])
def test_invalid_generation_fails_before_publication(content, invalid):
    data, snapshot = content
    question = data["questions"][0]
    match invalid:
        case "count":
            data["flashcards"].clear()
        case "kind":
            question.update(kind="step_by_step", grading_mode="exact", expected_answer=["A"], rubric_criteria=RUBRIC)
        case "alignment":
            question["objective_ids"] = ["foreign"]
        case "feedback_mode":
            question["feedback"][0]["mode"] = "formula"
        case "feedback_quote":
            question["feedback"][0]["quote"] = "texto que no llegó en el contexto"
        case "stimulus":
            question["stimulus_id"] = "invented"
        case "block_source":
            data["lesson_blocks"][0]["source_citations"][0]["source_id"] = "outside"
        case "profile_blocks":
            data["lesson_blocks"][1]["kind"] = "another"
        case "no_objective_question":
            question.update(kind="essay", expected_answer=None, rubric_criteria=RUBRIC)
        case "url_keyword":
            data["youtube_keywords"] = ["https://example.test/"]
        case "reserved_marker":
            question["sequence_presentation_initialized"] = True
        case "blank_prompt":
            question["prompt"] = " \n "
    with pytest.raises(LLMError) as error:
        build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)
    assert error.value.code == "LLM_INVALID_RESPONSE"
    assert "example.test" not in str(error.value)


@pytest.mark.parametrize("criteria", [[], [{**RUBRIC[0], "descriptors": [" "]}]])
def test_generated_legacy_rubric_requires_complete_criteria(content, criteria):
    data, snapshot = content
    data["questions"][1].update(kind="rubric", rubric_criteria=criteria)
    with pytest.raises(LLMError) as error:
        build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)
    assert error.value.code == "LLM_INVALID_RESPONSE"


@pytest.mark.parametrize("kind", ["matching", "sequence"])
def test_provider_ids_are_replaced_without_changing_solution_semantics(content, kind):
    data, snapshot = content
    first = {"id": "solution-first", "text": "Inicio"}
    second = {"id": "solution-second", "text": "Final"}
    item = {
        "kind": kind, "prompt": "Organiza las partes.", "objective_ids": ["contrast"],
    }
    if kind == "sequence":
        item.update(sequence_items=[first, second], expected_answer=[first["id"], second["id"]])
    else:
        item.update(
            matching_left=[first, second], matching_right=[first, second],
            matching_pairs=[{"left_id": first["id"], "right_id": second["id"]},
                            {"left_id": second["id"], "right_id": first["id"]}],
        )
    data["questions"][0] = item
    built = build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)
    question = built.draft.adaptive_assessment.questions[0]
    assert "solution-" not in question.model_dump_json()
    if kind == "sequence":
        labels = {item.id: item.text for item in question.sequence_items}
        assert [labels[id_] for id_ in question.expected_answer] == ["Inicio", "Final"]
    else:
        left = {item.id: item.text for item in question.matching_left}
        right = {item.id: item.text for item in question.matching_right}
        assert [(left[pair.left_id], right[pair.right_id]) for pair in question.matching_pairs] == [
            ("Inicio", "Final"), ("Final", "Inicio"),
        ]


def test_persisted_question_ids_cannot_collide(content):
    _, snapshot = content
    from app.pedagogy.contracts import AdaptiveAssessmentPayload

    item = {
        "kind": "true_false", "prompt": "¿Es correcto?", "expected_answer": True,
        "objective_ids": [snapshot.objectives[0].id], "question_id": "same",
    }
    with pytest.raises(ValidationError):
        AdaptiveAssessmentPayload(schema_version=2, question_objectives={}, questions=[item, item])


def test_prompt_uses_indexed_sources_and_keeps_previous_lesson_outside_evidence(content):
    _, snapshot = content
    chunks = index_source_chunks(["", "# Capítulo\n", "Otro fragmento"])
    assert chunks == {"fragment-1": "# Capítulo", "fragment-2": "Otro fragmento"}
    prompt = build_adaptive_session_prompt(
        "Causalidad", "Comprender testimonios", chunks, CONFIG, snapshot,
        failed_points=[{"prompt": "Pregunta fallada", "answer": "Respuesta previa"}],
        previous_lesson="Lección anterior",
    )
    assert all(value in prompt for value in [
        "fragment-1", "# Capítulo", "Pregunta fallada", "Lección anterior", "source_comparison",
    ])
    assert "no es una fuente" in prompt.lower()


def test_formula_feedback_requires_a_formula_in_the_verified_quote(content):
    data, _ = content
    objective = LearningObjective(id="contrast", skill="conversion", description="Convierte.", bloom_target="apply")
    snapshot = snapshot_profile(resolve_profile("mathematics", None), [objective])
    data["lesson_blocks"][0]["kind"] = "worked_example"
    data["lesson_blocks"][1]["kind"] = "practice_problem"
    data["questions"][1] = {
        "kind": "short_answer", "grading_mode": "exact", "expected_answer": ["0,75"],
        "prompt": "Convierte a decimal.", "objective_ids": ["contrast"],
    }
    feedback = data["questions"][0]["feedback"][0]
    feedback.update(mode="formula", heading=None)
    without_formula = build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)
    assert without_formula.draft.adaptive_assessment.questions[0].feedback == []

    sources = {"fragment-1": SOURCES["fragment-1"] + "\n3/4 = 0,75"}
    feedback["quote"] = "3/4 = 0,75"
    grounded = build_adaptive_session_content(data, CONFIG, snapshot, sources)
    assert "3/4 = 0,75" in grounded.draft.adaptive_assessment.questions[0].feedback[0].text
