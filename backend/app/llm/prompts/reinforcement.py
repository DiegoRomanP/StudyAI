"""Prompt for the single LLM call that reinforces a review session.

Same JSON contract (and the same ``session_content`` kind) as the plan's per-session
call, so model routing and the runtime report need no new entry.
"""

from __future__ import annotations

from app.llm.prompts.session_content import SCHEMA_TEMPLATE

MAX_POINTS = 12


def build_reinforcement_prompt(
    topic: str,
    goal: str,
    points: list[dict],
    material_excerpt: str,
    flashcards: int,
    multiple_choice: int,
) -> str:
    listed = (
        "\n".join(
            f"- Pregunta: {p['prompt']}\n  Respuesta correcta: {p['answer']}" for p in points[:MAX_POINTS]
        )
        or "(sin puntos)"
    )
    return (
        f"META:\n{goal}\n\nTEMA:\n{topic}\n\nPUNTOS QUE EL ESTUDIANTE FALLÓ:\n{listed}\n\n"
        f"MATERIAL ORIGINAL (extracto):\n{material_excerpt or '(sin material)'}\n\n"
        "Redacta material de REFUERZO en Markdown centrado solo en esos puntos: para cada uno, explica la idea "
        "con otras palabras, da un ejemplo concreto y señala el error típico. Añade 2-4 'youtube_keywords' (NO URLs).\n\n"
        f"Crea EXACTAMENTE {flashcards} flashcards y {multiple_choice} preguntas de opción múltiple (4 opciones) "
        "NUEVAS sobre esos puntos; no copies las preguntas originales. 'answer' debe coincidir exactamente con una opción.\n\n"
        f"Devuelve exactamente este esquema JSON:\n{SCHEMA_TEMPLATE}"
    )
