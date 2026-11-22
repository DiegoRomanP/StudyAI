"""Accessible lesson stimuli with server-validated source evidence."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BeforeValidator,
    BaseModel,
    ConfigDict,
    Field,
    FiniteFloat,
    StringConstraints,
    TypeAdapter,
    model_validator,
)

from app.pedagogy.svg_sanitizer import sanitize_svg

_UNSAFE_TEXT = re.compile(
    r"<\s*/?\s*[a-z][^>]*>|\]\s*\(|(?:https?|ftp)://|www\.|javascript:\S|data:(?:[a-z0-9.+-]+/|[;,])",
    re.I,
)
_HEADING = re.compile(r"^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$")
_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
_NUMBER = re.compile(r"(?<![\w.,])[-+]?[0-9]+(?:[.,][0-9]+)?(?!\w|[.,][0-9])")
_MEASUREMENTS = re.compile(r";|(?<=[.!?])\s+")


def _safe_text(value: str) -> str:
    if _UNSAFE_TEXT.search(unicodedata.normalize("NFKC", value)):
        raise ValueError("El estímulo debe usar texto y datos sin enlaces ni HTML.")
    return value


Label = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160), AfterValidator(_safe_text)
]
Body = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000), AfterValidator(_safe_text)
]
EquivalentText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24000), AfterValidator(_safe_text)
]
Identifier = Annotated[
    str, StringConstraints(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]*$")
]
GraphValue = Label | Annotated[FiniteFloat, Field(strict=True)]


class _StimulusModel(BaseModel):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")


class _StimulusBase(_StimulusModel):
    id: Identifier
    title: Label
    objective_ids: list[Identifier] = Field(min_length=1, max_length=12)
    origin: Literal["derived", "generated_example"]
    source_id: Identifier | None = None

    @model_validator(mode="after")
    def validate_provenance(self) -> _StimulusBase:
        if (self.origin == "derived") != (self.source_id is not None):
            raise ValueError("Solo los estímulos derivados requieren una referencia de material.")
        if len(set(self.objective_ids)) != len(self.objective_ids):
            raise ValueError("Los objetivos del estímulo deben ser únicos.")
        return self


class DiagramNode(_StimulusModel):
    id: Identifier
    label: Label


class DiagramEdge(_StimulusModel):
    from_id: Identifier
    to_id: Identifier
    label: Label


class DiagramStimulus(_StimulusBase):
    kind: Literal["diagram"]
    origin: Literal["derived"]
    nodes: list[DiagramNode] = Field(min_length=2, max_length=12)
    edges: list[DiagramEdge] = Field(min_length=1, max_length=18)
    text_alternative: EquivalentText

    @model_validator(mode="after")
    def validate_links(self) -> DiagramStimulus:
        ids = {node.id for node in self.nodes}
        links = {(edge.from_id, edge.to_id, edge.label) for edge in self.edges}
        if len(ids) != len(self.nodes) or len(links) != len(self.edges):
            raise ValueError("Los nodos y relaciones del diagrama deben ser únicos.")
        if any(start not in ids or end not in ids for start, end, _ in links):
            raise ValueError("Cada relación debe referirse a nodos del diagrama.")
        return self


class GraphPoint(_StimulusModel):
    x: GraphValue
    y: Annotated[FiniteFloat, Field(strict=True)]


class GraphSeries(_StimulusModel):
    name: Label
    points: list[GraphPoint] = Field(min_length=1, max_length=30)


class GraphStimulus(_StimulusBase):
    kind: Literal["graph"]
    origin: Literal["derived"]
    x_label: Label
    y_label: Label
    x_unit: Label | None = None
    y_unit: Label | None = None
    series: list[GraphSeries] = Field(min_length=1, max_length=4)
    text_alternative: EquivalentText

    @model_validator(mode="after")
    def unique_series(self) -> GraphStimulus:
        if len({series.name.casefold() for series in self.series}) != len(self.series):
            raise ValueError("Los nombres de las series deben ser únicos.")
        return self


class CaseStimulus(_StimulusBase):
    kind: Literal["case"]
    body_markdown: Body


class LongTextStimulus(_StimulusBase):
    kind: Literal["long_text"]
    origin: Literal["derived"]
    body_markdown: Body


class SvgStimulus(_StimulusBase):
    """An illustrative drawing written by the AI; stored already sanitized."""

    kind: Literal["svg"]
    origin: Literal["generated_example"]
    svg: Annotated[str, BeforeValidator(sanitize_svg)]
    text_alternative: EquivalentText


FIGURE_MARKER = re.compile(r"\[figura:(\d+)\]")


class FigureStimulus(_StimulusBase):
    """A figure extracted from the learner's own document, shown by its server-side ID."""

    kind: Literal["figure"]
    origin: Literal["derived"]
    asset_id: Annotated[int, Field(gt=0)]
    text_alternative: EquivalentText


Stimulus = Annotated[
    DiagramStimulus | GraphStimulus | CaseStimulus | LongTextStimulus | SvgStimulus | FigureStimulus,
    Field(discriminator="kind"),
]
_STIMULUS = TypeAdapter(Stimulus)


_BULLETS = "•●▪◦‣∙"
# Models retype quotes: a PDF bullet or a typographic quote mark must not void a citation.
# The match still returns the server's own text, so nothing unverified is published.
_QUOTE_VARIANTS = {char: "['‘’]" for char in "'‘’"} | {char: "[\"“”«»]" for char in "\"“”«»"}
_GAP = rf"[\s{_BULLETS}]+"


def _token_pattern(token: str) -> str:
    return "".join(_QUOTE_VARIANTS.get(char) or re.escape(char) for char in token)


def _literal_match(source: str, quote: str) -> re.Match[str] | None:
    tokens = [token for token in unicodedata.normalize("NFKC", quote).split() if token.strip(_BULLETS)]
    if not tokens:
        return None
    start = r"(?<!\w)" if tokens[0][0].isalnum() else ""
    end = r"(?!\w)" if tokens[-1][-1].isalnum() else ""
    if tokens[0][0].isdigit():
        start += r"(?<!\d[.,/])(?<![+\-−])"
    if tokens[-1][-1].isdigit():
        end += r"(?![.,/]\d)"
    pattern = start + _GAP.join(map(_token_pattern, tokens)) + end
    return re.search(pattern, unicodedata.normalize("NFKC", source))


def evidence_excerpt(sources: Mapping[str, str], source_id: str, quote: str) -> str:
    """Return the server's matching excerpt, preserving its line boundaries."""
    source = sources.get(source_id)
    if source is not None and isinstance(quote, str) and 0 < len(quote) <= 4000:
        match = _literal_match(source, quote)
        if match is not None:
            return match.group()
    raise ValueError("El fragmento no está en el contexto de la sesión.")


def has_source_heading(source: str, heading: str) -> bool:
    """Check Markdown heading text outside fenced code."""
    fence = ""
    for line in source.splitlines():
        marker = _FENCE.fullmatch(line)
        if marker:
            token, remainder = marker.groups()
            if not fence:
                fence = token
            elif token.startswith(fence) and not remainder.strip():
                fence = ""
        elif not fence:
            candidate = _HEADING.fullmatch(line)
            if candidate is not None and candidate.group(1) == heading:
                return True
    return False


def _words(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def _label_pattern(value: str) -> str:
    label = _words(value)
    start = r"(?<!\w)" if label[0].isalnum() else ""
    end = r"(?!\w)" if label[-1].isalnum() else ""
    return start + re.escape(label) + end


def _diagram_equivalent(stimulus: DiagramStimulus, excerpt: str) -> str:
    labels = {node.id: _label_pattern(node.label) for node in stimulus.nodes}
    rows = [_words(line) for line in excerpt.splitlines()]
    if any(not any(re.search(label, row) for row in rows) for label in labels.values()):
        raise ValueError("El contexto debe contener cada nodo del diagrama.")
    for edge in stimulus.edges:
        gap = r"\s+(?:(?:el|la|los|las|un|una|unos|unas)\s+)?"
        relation = gap.join((labels[edge.from_id], _label_pattern(edge.label), labels[edge.to_id]))
        if not any(re.search(relation, row) for row in rows):
            raise ValueError("La relación del diagrama debe aparecer en el fragmento.")
    names = {node.id: node.label for node in stimulus.nodes}
    connected = {id_ for edge in stimulus.edges for id_ in (edge.from_id, edge.to_id)}
    lines = [f"{names[edge.from_id]} {edge.label} {names[edge.to_id]}" for edge in stimulus.edges]
    lines.extend(f"Nodo sin conexión: {label}" for id_, label in names.items() if id_ not in connected)
    return "\n".join(lines)


def _value_spans(row: str, value: str | float) -> list[tuple[int, int]]:
    if isinstance(value, str):
        return [match.span() for match in re.finditer(_label_pattern(value), row)]
    expected = Decimal(str(value))
    return [
        match.span()
        for match in _NUMBER.finditer(row)
        if Decimal(match.group().replace(",", ".")) == expected
    ]


def _graph_equivalent(stimulus: GraphStimulus, excerpt: str) -> str:
    context = _words(excerpt)
    axes = (stimulus.x_label, stimulus.y_label, stimulus.x_unit, stimulus.y_unit)
    if any(label and not re.search(_label_pattern(label), context) for label in axes):
        raise ValueError("Los ejes y unidades deben aparecer en el fragmento.")
    rows = [_words(segment) for line in excerpt.splitlines() for segment in _MEASUREMENTS.split(line)]
    for series in stimulus.series:
        series_rows = rows if len(stimulus.series) == 1 else [
            row for row in rows if re.search(_label_pattern(series.name), row)
        ]
        for point in series.points:
            if not any(
                x_end <= y_start and _NUMBER.search(row, x_end, y_start) is None
                for row in series_rows
                for _, x_end in _value_spans(row, point.x)
                for y_start, _ in _value_spans(row, point.y)
            ):
                raise ValueError("El par de valores debe aparecer junto en el fragmento.")

    x_heading = f"{stimulus.x_label} ({stimulus.x_unit})" if stimulus.x_unit else stimulus.x_label
    y_heading = f"{stimulus.y_label} ({stimulus.y_unit})" if stimulus.y_unit else stimulus.y_label
    return "\n".join([
        f"{x_heading} → {y_heading}",
        *(f"{series.name}: {point.x} → {point.y}" for series in stimulus.series for point in series.points),
    ])


def validate_stimuli(
    raw: Sequence[dict[str, object]], sources: Mapping[str, str], objective_ids: set[str]
) -> list[Stimulus]:
    if len(raw) > 12:
        raise ValueError("La sesión admite hasta 12 estímulos.")
    result: list[Stimulus] = []
    stimulus_ids: set[str] = set()
    for data in raw:
        if not isinstance(data, Mapping):
            raise ValueError("Cada estímulo debe ser un objeto.")
        public_data = dict(data)
        quote = public_data.pop("evidence_quote", None)
        stimulus = _STIMULUS.validate_python(public_data)
        if stimulus.id in stimulus_ids or not set(stimulus.objective_ids).issubset(objective_ids):
            raise ValueError("El estímulo necesita un ID único y objetivos de la sesión.")

        if stimulus.source_id is None:
            if quote is not None:
                raise ValueError("Un ejemplo generado no puede declarar evidencia de fuente.")
        else:
            if not isinstance(quote, str):
                raise ValueError("El estímulo derivado requiere una cita del fragmento.")
            excerpt = evidence_excerpt(sources, stimulus.source_id, quote)
            if isinstance(stimulus, FigureStimulus):
                # Only a figure retrieved for this session (and so from the plan's own documents).
                markers = {int(match) for match in FIGURE_MARKER.findall(sources[stimulus.source_id])}
                if stimulus.asset_id not in markers:
                    raise ValueError("La figura debe aparecer en el fragmento citado.")
            elif isinstance(stimulus, DiagramStimulus):
                stimulus = stimulus.model_copy(update={"text_alternative": _diagram_equivalent(stimulus, excerpt)})
            elif isinstance(stimulus, GraphStimulus):
                stimulus = stimulus.model_copy(update={"text_alternative": _graph_equivalent(stimulus, excerpt)})
            elif _literal_match(excerpt, stimulus.body_markdown) is None:
                raise ValueError("El texto mostrado debe estar en el fragmento.")

        stimulus_ids.add(stimulus.id)
        result.append(stimulus)
    return result
