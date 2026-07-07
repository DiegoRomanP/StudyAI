"""Prompt for LLM call #1 — identify study topics from source material.

Given retrieved chunks + the learner's goal, ask the model for topics with
subtopics, a difficulty (1-5) and a relevance (0-1) toward the goal, as strict
JSON.
"""

from __future__ import annotations

SYSTEM = (
    "Eres un tutor experto que analiza material de estudio y extrae una lista "
    "estructurada de temas. Respondes ÚNICAMENTE con JSON válido, sin texto "
    "adicional ni fences de markdown."
)

_SCHEMA = """{
  "topics": [
    {
      "name": "string",
      "subtopics": ["string", "..."],
      "difficulty": 1,          // entero 1..5
      "relevance": 0.0          // decimal 0..1 respecto a la meta
    }
  ]
}"""


def build_topic_analysis_prompt(chunks: list[str], goal: str) -> str:
    material = "\n\n---\n\n".join(chunks) if chunks else "(sin material)"
    return (
        f"META DEL ESTUDIANTE:\n{goal}\n\n"
        f"MATERIAL (fragmentos recuperados):\n{material}\n\n"
        f"Identifica entre 6 y 10 temas de estudio relevantes para la meta. "
        f"Para cada tema incluye 2-3 subtemas, una dificultad (1 fácil .. 5 difícil) "
        f"y una relevancia (0..1) respecto a la meta.\n\n"
        f"Devuelve exactamente este esquema JSON:\n{_SCHEMA}"
    )
