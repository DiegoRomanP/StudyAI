"""SVG drawings and document figures as v2 lesson stimuli."""

import pytest

from app.llm.prompts.adaptive_session_content import build_adaptive_session_prompt
from app.pedagogy.contracts import LearningObjective
from app.pedagogy.registry import resolve_profile, snapshot_profile
from app.pedagogy.stimuli import validate_stimuli
from app.pedagogy.svg_sanitizer import sanitize_svg
from app.strategies.base import SessionConfig

OBJECTIVES = {"ciclo"}
SOURCES = {"fragment-1": "El ciclo del agua.\n\n[figura:7] Un diagrama con nubes y lluvia.\n\nFin."}


def svg_stimulus(svg):
    return {
        "id": "dibujo", "kind": "svg", "title": "Ciclo del agua", "objective_ids": ["ciclo"],
        "origin": "generated_example", "svg": svg, "text_alternative": "Nube, lluvia y río en círculo.",
    }


def figure_stimulus(asset_id, quote="[figura:7] Un diagrama con nubes y lluvia."):
    return {
        "id": "figura", "kind": "figure", "title": "Figura del libro", "objective_ids": ["ciclo"],
        "origin": "derived", "source_id": "fragment-1", "asset_id": asset_id,
        "evidence_quote": quote, "text_alternative": "Diagrama del ciclo del agua.",
    }


def test_sanitizer_keeps_drawing_and_drops_every_active_or_external_part():
    dirty = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='100' onload='alert(1)'>"
        "<script>alert(1)</script>"
        "<rect x='1' y='1' width='50' height='20' fill='url(#g)' onclick='x()'/>"
        "<a href='https://evil.example'><text x='5' y='40'>clic</text></a> tras"
        "<image href='https://evil.example/t.png'/>"
        "<foreignObject><div>html</div></foreignObject>"
        "<circle cx='5' cy='5' r='3' fill='url(https://evil.example/p)' style='fill:red'/>"
        "<text x='5' y='80'>H<tspan dy='3'>2</tspan>O</text>"
        "</svg>"
    )
    clean = sanitize_svg(dirty)

    for banned in ("script", "onload", "onclick", "href", "evil", "foreignObject", "<image", "style", "<a"):
        assert banned not in clean
    assert "<rect" in clean and "url(#g)" in clean and "<tspan" in clean
    assert 'viewBox="0 0 200 100"' in clean and 'xmlns="http://www.w3.org/2000/svg"' in clean
    assert sanitize_svg(clean) == clean  # idempotent: stored payloads revalidate


@pytest.mark.parametrize(
    "markup",
    [
        "<html><body/></html>",
        "no es xml",
        '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa">]><svg>&a;</svg>',
        "<svg>" + "x" * 20_001 + "</svg>",
    ],
)
def test_sanitizer_rejects_what_is_not_a_plain_svg(markup):
    with pytest.raises(ValueError):
        sanitize_svg(markup)


def test_a_sanitized_svg_always_passes_a_second_validation():
    # Serializing lengthens self-closing tags; an input under the limit can come out over it.
    markup = "<svg>" + "<path d='M0 0'/>" * 1180 + "</svg>"
    assert len(markup) < 20_000
    with pytest.raises(ValueError):  # rejected up front, not when the stored lesson is read
        sanitize_svg(markup)
    clean = sanitize_svg("<svg>" + "<path d='M0 0'/>" * 100 + "</svg>")
    assert sanitize_svg(clean) == clean


def test_svg_stimulus_is_stored_sanitized():
    (stimulus,) = validate_stimuli(
        [svg_stimulus("<svg viewBox='0 0 10 10'><path d='M0 0L10 10' onmouseover='x()'/></svg>")],
        SOURCES, OBJECTIVES,
    )
    assert stimulus.svg.startswith("<svg") and "onmouseover" not in stimulus.svg


def test_svg_must_be_a_generated_example():
    data = svg_stimulus("<svg viewBox='0 0 1 1'/>") | {"origin": "derived", "source_id": "fragment-1"}
    with pytest.raises(ValueError):
        validate_stimuli([data], SOURCES, OBJECTIVES)


def test_figure_stimulus_only_accepts_figures_present_in_its_fragment():
    (stimulus,) = validate_stimuli([figure_stimulus(7)], SOURCES, OBJECTIVES)
    assert stimulus.asset_id == 7

    with pytest.raises(ValueError):  # another user's or another plan's figure id
        validate_stimuli([figure_stimulus(8, quote="Un diagrama con nubes y lluvia.")], SOURCES, OBJECTIVES)
    with pytest.raises(ValueError):
        validate_stimuli([figure_stimulus("siete")], SOURCES, OBJECTIVES)


def test_rich_guide_is_only_offered_to_rich_providers_and_figures_only_when_present():
    snapshot = snapshot_profile(resolve_profile("biology", None), [
        LearningObjective(id="ciclo", skill="ciclo", description="Explicar el ciclo", bloom_target="understand"),
    ])
    config = SessionConfig(duration_minutes=20, flashcards=1, multiple_choice=1, emphasis="comprensión")
    plain = build_adaptive_session_prompt("Agua", "Entender", SOURCES, config, snapshot)
    rich = build_adaptive_session_prompt("Agua", "Entender", SOURCES, config, snapshot, rich_content=True)
    rich_without_figures = build_adaptive_session_prompt(
        "Agua", "Entender", {"fragment-1": "Texto."}, config, snapshot, rich_content=True
    )

    svg, figure = '"kind":"svg"', '"kind":"figure"'
    assert svg not in plain and figure not in plain
    assert svg in rich and figure in rich
    assert svg in rich_without_figures and figure not in rich_without_figures
