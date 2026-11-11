import copy

import pytest

from app.pedagogy.stimuli import evidence_excerpt, has_source_heading, validate_stimuli


SOURCE = "## Datos del vivero\nAltura (cm) por semana\nSemana 1: 2,5\nSemana 2: 8\nLa raíz absorbe agua."
SOURCES = {"excerpt-a": SOURCE}
OBJECTIVES = {"interpretar"}


def stimulus(kind, **extra):
    return {
        "id": "stimulus-a",
        "kind": kind,
        "title": "Vivero",
        "objective_ids": ["interpretar"],
        "origin": "derived",
        "source_id": "excerpt-a",
        **extra,
    }


def graph():
    return stimulus(
        "graph",
        x_label="Semana",
        y_label="Altura",
        y_unit="cm",
        series=[{"name": "Vivero", "points": [{"x": 1, "y": 2.5}, {"x": 2, "y": 8}]}],
        text_alternative="La altura fue 2,5 cm en la primera semana y 8 cm en la segunda.",
        evidence_quote="Altura (cm) por semana\nSemana 1: 2,5\nSemana 2: 8",
    )


def diagram():
    return stimulus(
        "diagram",
        nodes=[{"id": "root", "label": "raíz"}, {"id": "water", "label": "agua"}],
        edges=[{"from_id": "root", "to_id": "water", "label": "absorbe"}],
        text_alternative="La raíz absorbe agua.",
        evidence_quote="La raíz absorbe agua.",
    )


def test_evidence_uses_actual_source_excerpt_and_exact_heading():
    assert evidence_excerpt(SOURCES, "excerpt-a", "Semana 1:  2,5 Semana 2: 8") == (
        "Semana 1: 2,5\nSemana 2: 8"
    )
    assert has_source_heading(SOURCE, "Datos del vivero")
    assert not has_source_heading(SOURCE, "datos del vivero")
    assert not has_source_heading(SOURCE, "Semana 2: 8")
    assert not has_source_heading("```md\n## Inventado\n```", "Inventado")


def test_public_stimuli_are_typed_and_omit_private_evidence_quote():
    items = validate_stimuli([graph(), {**diagram(), "id": "stimulus-b"}], SOURCES, OBJECTIVES)
    chart, scheme = [item.model_dump(mode="json") for item in items]
    assert chart["series"][0]["points"] == [{"x": 1, "y": 2.5}, {"x": 2, "y": 8}]
    assert scheme["edges"][0] == {"from_id": "root", "to_id": "water", "label": "absorbe"}
    assert all(item["text_alternative"] for item in (chart, scheme))
    assert all("evidence_quote" not in item for item in (chart, scheme))


def test_case_examples_and_literal_text_have_distinct_provenance():
    case = stimulus(
        "case", origin="generated_example", source_id=None, body_markdown="Imagina un vivero."
    )
    passage = stimulus(
        "long_text", id="passage", body_markdown="La raíz absorbe agua.",
        evidence_quote="La raíz absorbe agua.",
    )
    example, excerpt = validate_stimuli([case, passage], SOURCES, OBJECTIVES)
    assert example.origin == "generated_example" and example.source_id is None
    assert excerpt.origin == "derived" and excerpt.source_id == "excerpt-a"


@pytest.mark.parametrize(
    "changes",
    [
        {"source_id": "missing"},
        {"evidence_quote": "Semana 3: 16"},
        {"objective_ids": ["unknown"]},
        {"objective_ids": ["interpretar", "interpretar"]},
        {"text_alternative": "   "},
        {"text_alternative": "<svg><script>test</script></svg>"},
        {"text_alternative": "[Recurso](https://example.test)"},
        {"origin": "generated_example", "source_id": None},
        {"series": [{"name": "Vivero", "points": [{"x": 1, "y": float("nan")}]}]},
    ],
)
def test_invalid_stimuli_are_rejected(changes):
    with pytest.raises(ValueError):
        validate_stimuli([{**graph(), **changes}], SOURCES, OBJECTIVES)


def test_invented_graph_pairs_and_reversed_diagram_edges_are_rejected():
    incorrect_graph = copy.deepcopy(graph())
    incorrect_graph["series"][0]["points"][0]["y"] = 8
    incorrect_diagram = copy.deepcopy(diagram())
    incorrect_diagram["edges"][0].update(from_id="water", to_id="root")
    for item in (incorrect_graph, incorrect_diagram):
        with pytest.raises(ValueError):
            validate_stimuli([item], SOURCES, OBJECTIVES)


def test_graph_cannot_cross_two_measurements_on_the_same_source_line():
    data = graph()
    data["series"][0]["points"][0]["y"] = 8
    data["evidence_quote"] = "Altura (cm) por semana; Semana 1: 2,5; Semana 2: 8"
    with pytest.raises(ValueError, match="par de valores"):
        validate_stimuli([data], {"excerpt-a": data["evidence_quote"]}, OBJECTIVES)


def test_accessible_equivalents_are_derived_from_validated_content():
    scheme = diagram()
    scheme["id"] = "diagram"
    scheme["text_alternative"] = "La raíz produce agua."
    chart = graph()
    chart["text_alternative"] = "En la primera semana la altura fue de 999 cm."
    graph_item, diagram_item = validate_stimuli([chart, scheme], SOURCES, OBJECTIVES)
    assert "999" not in graph_item.text_alternative
    assert "Semana" in graph_item.text_alternative and "2.5" in graph_item.text_alternative
    assert diagram_item.text_alternative == "raíz absorbe agua"


def test_graph_evidence_can_end_a_value_with_sentence_punctuation():
    data = graph()
    data["title"] = "Data: vivero"
    data["evidence_quote"] += "."
    source = SOURCE.replace("Semana 2: 8", "Semana 2: 8.")
    assert validate_stimuli([data], {"excerpt-a": source}, OBJECTIVES)[0].title == "Data: vivero"


def test_duplicate_ids_and_claimed_sources_for_fiction_are_rejected():
    invalid_examples = [
        [graph(), graph()],
        [stimulus("case", origin="generated_example", body_markdown="Imagina un vivero.")],
        [stimulus("long_text", body_markdown="La hoja absorbe agua.", evidence_quote="La raíz absorbe agua.")],
    ]
    for examples in invalid_examples:
        with pytest.raises(ValueError):
            validate_stimuli(examples, SOURCES, OBJECTIVES)


def test_diagram_text_equivalent_includes_isolated_nodes():
    data = diagram()
    data["nodes"].append({"id": "leaf", "label": "hoja"})
    data["evidence_quote"] += " La hoja recibe luz."
    [item] = validate_stimuli([data], {"excerpt-a": data["evidence_quote"]}, OBJECTIVES)
    assert "raíz absorbe agua" in item.text_alternative
    assert "hoja" in item.text_alternative


def test_evidence_cannot_extract_partial_words():
    with pytest.raises(ValueError, match="contexto"):
        evidence_excerpt({"excerpt-a": "La desinformación circula."}, "excerpt-a", "información circula")
