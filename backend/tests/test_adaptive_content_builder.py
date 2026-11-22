import pytest
from pydantic import ValidationError

from app.core.exceptions import LLMError
from app.llm.prompts.adaptive_session_content import (
    build_adaptive_session_prompt,
    index_source_chunks,
)
from app.llm.prompts.topic_analysis import build_topic_analysis_prompt
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


def test_single_feedback_object_uses_the_same_evidence_validation_as_a_list(content):
    data, snapshot = content
    question = data["questions"][0]
    expected = build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)
    question["feedback"] = question["feedback"][0]

    built = build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)

    assert built.draft.adaptive_assessment.questions[0].feedback == (
        expected.draft.adaptive_assessment.questions[0].feedback
    )
    question["feedback"]["quote"] = "Cita ausente del material."
    dropped = build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)
    assert dropped.draft.adaptive_assessment.questions[0].feedback == []


@pytest.mark.parametrize("unverifiable", ["feedback_mode", "feedback_quote", "feedback_block_id", "block_source"])
def test_unverifiable_citations_are_dropped_without_failing_the_session(content, unverifiable):
    data, snapshot = content
    feedback = data["questions"][0]["feedback"][0]
    match unverifiable:
        case "feedback_mode":
            feedback["mode"] = "formula"
        case "feedback_quote":
            feedback["quote"] = "texto que no llegó en el contexto"
        case "feedback_block_id":
            feedback["source_id"] = "context"  # a lesson block id, as real models answer
        case "block_source":
            data["lesson_blocks"][0]["source_citations"][0]["source_id"] = "outside"
    built = build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)
    if unverifiable == "block_source":
        assert built.draft.lesson_blocks[0].source_refs == []
    else:
        assert built.draft.adaptive_assessment.questions[0].feedback == []


def test_retyped_quote_still_matches_and_publishes_the_source_text(content):
    data, snapshot = content
    sources = {"fragment-1": "Features can be:\n• Task Type: the model’s query"}
    feedback = data["questions"][0]["feedback"][0]
    feedback.update(quote="Features can be: Task Type: the model's query", heading=None)
    data["lesson_blocks"][0].pop("source_citations")
    data.pop("stimuli")
    data["lesson_blocks"][0].pop("stimulus_id")
    data["questions"][0].pop("stimulus_id")
    built = build_adaptive_session_content(data, CONFIG, snapshot, sources)
    assert "• Task Type: the model’s query" in built.draft.adaptive_assessment.questions[0].feedback[0].text


def test_invalid_questions_from_a_real_model_are_dropped_and_the_rest_published(content):
    data, snapshot = content
    config = SessionConfig(duration_minutes=20, flashcards=1, multiple_choice=4, emphasis="examen")
    many_to_one = {
        "kind": "matching", "prompt": "Relaciona.", "objective_ids": ["contrast"],
        "matching_left": [{"id": "l1", "text": "A"}, {"id": "l2", "text": "B"}, {"id": "l3", "text": "C"}],
        "matching_right": [{"id": "r1", "text": "X"}, {"id": "r2", "text": "Y"}],
        "matching_pairs": [{"left_id": "l1", "right_id": "r1"}, {"left_id": "l2", "right_id": "r1"},
                           {"left_id": "l3", "right_id": "r2"}],
    }
    no_rubric = {
        "kind": "short_answer", "prompt": "Resume.", "objective_ids": ["contrast"],
        "grading_mode": "formative", "rubric_criteria": None,
    }
    data["questions"] += [many_to_one, no_rubric]
    built = build_adaptive_session_content(data, config, snapshot, SOURCES)
    assert [q.kind for q in built.draft.adaptive_assessment.questions] == ["true_false", "essay"]


def test_dropping_the_only_question_of_an_objective_still_fails(content):
    data, snapshot = content
    data["questions"][0]["objective_ids"] = ["foreign"]
    with pytest.raises(LLMError, match="adaptativas válidas"):
        build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)


def test_invalid_stimulus_is_dropped_and_its_references_unlinked(content):
    data, snapshot = content
    data["stimuli"][0]["origin"] = {"type": "derived", "source_id": "fragment-1"}  # seen from DeepSeek
    built = build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)
    assert built.draft.adaptive_assessment.stimuli == []
    assert built.draft.lesson_blocks[0].stimulus_id is None
    assert built.draft.adaptive_assessment.questions[0].stimulus_id is None


@pytest.mark.parametrize("invalid", [
    "count", "kind", "alignment",
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
    built = build_adaptive_session_content(data, CONFIG, snapshot, SOURCES)
    assert [q.kind for q in built.draft.adaptive_assessment.questions] == ["true_false"]


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


def test_prompt_specifies_exact_lesson_kinds_and_list_shaped_citations(content):
    _, snapshot = content
    prompt = build_adaptive_session_prompt("Relatos", "Contrastar", SOURCES, CONFIG, snapshot)

    assert 'valores exactos de kind: ["context", "source_comparison"]' in prompt
    assert "source_citations es una lista" in prompt
    assert "feedback es una lista" in prompt
    assert "SOLO con lo que explican los lesson_blocks" in prompt


def test_prompt_gives_literal_json_examples_for_boolean_keys_and_rubric_descriptors(content):
    _, snapshot = content
    prompt = build_adaptive_session_prompt("Relatos", "Contrastar", SOURCES, CONFIG, snapshot)

    assert '"kind":"true_false","expected_answer":false' in prompt
    assert '"descriptors":["Cita una frase del material."]' in prompt


def test_auto_topic_prompt_requires_allowed_bloom_ids_and_grounds_the_profile_in_the_topic():
    prompt = build_topic_analysis_prompt(["Un relato breve"], "Interpretar", adaptive=True)

    assert "Elige topic_profile según el razonamiento que exige el tema" in prompt
    assert "Usa understand si dudas del nivel" in prompt


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
