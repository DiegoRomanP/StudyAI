"""Prompt for LLM call #3a — generate study material for one session."""

from __future__ import annotations

SYSTEM = (
    "Eres un tutor que redacta material de estudio claro y conciso en Markdown. "
    "Respondes ÚNICAMENTE con JSON válido que contiene el markdown y palabras "
    "clave para buscar videos."
)

_SCHEMA = """{
  "summary_markdown": "string (markdown: resumen, explicación y punto clave)",
  "youtube_keywords": ["string", "..."]
}"""


def build_content_prompt(topic: str, goal: str, chunks: list[str]) -> str:
    material = "\n\n".join(chunks[:4]) if chunks else "(sin material adicional)"
    return (
        f"META:\n{goal}\n\n"
        f"TEMA DE LA SESIÓN:\n{topic}\n\n"
        f"MATERIAL DE REFERENCIA:\n{material}\n\n"
        f"Redacta material de estudio en Markdown con: (1) un resumen breve, "
        f"(2) una explicación estructurada y (3) un punto clave para recordar. "
        f"Añade 2-4 'youtube_keywords' útiles para buscar videos (NO URLs).\n\n"
        f"Devuelve exactamente este esquema JSON:\n{_SCHEMA}"
    )
