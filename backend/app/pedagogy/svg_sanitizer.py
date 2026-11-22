"""Rebuild an LLM-written SVG from an allowlist, so only static drawing survives.

Everything not listed (scripts, event handlers, links, external references,
embedded HTML, animation, CSS) is dropped rather than rejected: a diagram with
one bad attribute still renders. Only text that is not a well-formed SVG fails.
The browser shows the result inside ``<img>``, which never runs scripts either.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

_SVG_NS = "http://www.w3.org/2000/svg"
MAX_SVG_CHARS = 20_000

_ELEMENTS = frozenset({
    "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
    "text", "tspan", "defs", "marker", "title", "desc", "linearGradient", "radialGradient", "stop",
})
_ATTRIBUTES = frozenset({
    "id", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height",
    "d", "points", "transform", "viewBox", "preserveAspectRatio",
    "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray",
    "stroke-linecap", "stroke-linejoin", "opacity", "font-size", "font-family", "font-weight",
    "font-style", "text-anchor", "dominant-baseline", "dx", "dy",
    "markerWidth", "markerHeight", "refX", "refY", "orient", "markerUnits",
    "offset", "stop-color", "stop-opacity", "gradientUnits", "fx", "fy",
    "marker-start", "marker-mid", "marker-end", "role", "aria-label",
})
# Paints and marker references may only point inside the same SVG: url(#id).
_URL = re.compile(r"url\(\s*([^)]*)\)", re.I)
_LOCAL_URL = re.compile(r"^#[A-Za-z][\w.-]*$")


def sanitize_svg(markup: str) -> str:
    """Return a safe SVG string, or raise ``ValueError`` if it is not a usable SVG."""
    if not isinstance(markup, str) or len(markup) > MAX_SVG_CHARS:
        raise ValueError("El SVG debe ser texto de hasta 20000 caracteres.")
    # The XML parser would expand entities; a diagram never needs them.
    if re.search(r"<!(DOCTYPE|ENTITY)", markup, re.I):
        raise ValueError("El SVG no puede declarar DOCTYPE ni entidades.")
    try:
        root = ET.fromstring(markup.strip())
    except ET.ParseError as exc:
        raise ValueError("El SVG no es XML válido.") from exc
    if _local(root.tag) != "svg":
        raise ValueError("El elemento raíz debe ser <svg>.")
    clean = _copy(root)
    if "viewBox" not in clean.attrib and {"width", "height"} <= clean.attrib.keys():
        clean.set("viewBox", f"0 0 {clean.get('width')} {clean.get('height')}")
    clean.set("xmlns", _SVG_NS)  # last, so a second pass yields the same string
    output = ET.tostring(clean, encoding="unicode")
    # Serializing can lengthen the markup; checking the output keeps stored SVGs revalidatable.
    if len(output) > MAX_SVG_CHARS:
        raise ValueError("El SVG debe ser texto de hasta 20000 caracteres.")
    return output


def _local(tag: object) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _copy(element: ET.Element) -> ET.Element:
    clean = ET.Element(_local(element.tag))
    for name, value in element.attrib.items():
        name = _local(name)
        if name in _ATTRIBUTES and _safe_value(value):
            clean.set(name, value)
    clean.text = element.text
    for child in element:
        if _local(child.tag) in _ELEMENTS:
            copied = _copy(child)
            copied.tail = child.tail
            clean.append(copied)
        elif child.tail:  # drop the element, keep the text after it
            if len(clean):
                clean[-1].tail = (clean[-1].tail or "") + child.tail
            else:
                clean.text = (clean.text or "") + child.tail
    return clean


def _safe_value(value: str) -> bool:
    if "javascript:" in value.lower() or "expression(" in value.lower():
        return False
    return all(_LOCAL_URL.match(target.strip(" '\"")) for target in _URL.findall(value))
