"""Prompt for LLM call #2 — distribute selected topics into study sessions.

Receives the Pareto-selected topics and asks the model to lay them out as
25-minute sessions with Ebbinghaus-style review offsets (1, 3, 7, 14, 30 days).
The Pareto filtering itself happens in the service before this prompt is built.
"""

from __future__ import annotations

SYSTEM = (
    "Eres un planificador de estudio. Distribuyes temas en sesiones de estudio "
    "espaciadas siguiendo la curva del olvido de Ebbinghaus. Respondes ÚNICAMENTE "
    "con JSON válido."
)

_SCHEMA = """{
  "sessions": [
    { "topic_name": "string", "review_offset_days": 1 }
  ]
}"""


def build_plan_generation_prompt(
    topics: list[dict],
    goal: str,
    intervals: list[int],
    session_minutes: int,
) -> str:
    topic_lines = "\n".join(
        f"- {t['name']} (dificultad {t['difficulty']}, relevancia {t['relevance']})"
        for t in topics
    )
    return (
        f"META:\n{goal}\n\n"
        f"TEMAS SELECCIONADOS (top por relevancia):\n{topic_lines}\n\n"
        f"Crea una sesión de {session_minutes} minutos por tema. Asigna a cada "
        f"sesión un 'review_offset_days' tomado de estos intervalos de repaso "
        f"espaciado: {intervals}. Ordena de menor a mayor dificultad cuando sea "
        f"razonable.\n\n"
        f"Devuelve exactamente este esquema JSON:\n{_SCHEMA}"
    )
