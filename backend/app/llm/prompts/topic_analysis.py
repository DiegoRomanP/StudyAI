"""Prompt for LLM call #1 — identify study topics from source material.

Given retrieved chunks + the learner's goal, ask the model for topics with
subtopics, a difficulty (1-5) and a relevance (0-1) toward the goal, as strict
JSON.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

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
      "difficulty": 1,
      "relevance": 0.0
    }
  ]
}"""


_ADAPTIVE_SCHEMA = """{
  "topics": [
    {
      "name": "string",
      "subtopics": ["string", "..."],
      "difficulty": 1,
      "relevance": 0.0,
      "topic_profile": "logical_deductive",
      "objectives": [
        {
          "id": "unique stable id within this topic",
          "skill": "string",
          "description": "string",
          "bloom_target": "understand"
        }
      ]
    }
  ]
}"""


def build_topic_analysis_prompt(
    chunks: list[str],
    goal: str,
    *,
    adaptive: bool = False,
    profile_hint: str | None = None,
    subject_hint: str | None = None,
    profile_bloom_levels: Mapping[str, Sequence[str]] | None = None,
) -> str:
    material = "\n\n---\n\n".join(chunks) if chunks else "(sin material)"
    schema = _ADAPTIVE_SCHEMA if adaptive else _SCHEMA
    adaptive_instructions = ""
    if adaptive:
        if profile_bloom_levels:
            bloom_guidance = "\n".join(
                f"- {profile_id}: {', '.join(levels)}"
                for profile_id, levels in profile_bloom_levels.items()
            )
        else:
            bloom_guidance = "- General: remember, understand, apply, analyze, evaluate, create"
        adaptive_instructions = (
            "\nPara cada tema, propone un topic_profile de estos IDs: "
            "logical_deductive, critical_argumentative, linguistic_interpretive, "
            "systemic_empirical, applied_practical, mixed o null. Usa mixed cuando "
            "el tema combine razonamientos y null si el material no sustenta una "
            "clasificación. Incluye de 1 a 3 objetivos con IDs únicos dentro del tema, "
            "skill, description y bloom_target según los niveles permitidos por perfil:\n"
            f"{bloom_guidance}\n"
            f"La solicitud usa profile_hint={profile_hint or 'auto'} y "
            f"subject_hint={subject_hint or 'auto'}. La aplicación resuelve los hints "
            "explícitos después de clasificar cada tema.\n"
        )
    return (
        f"META DEL ESTUDIANTE:\n{goal}\n\n"
        f"MATERIAL (fragmentos recuperados):\n{material}\n\n"
        f"Identifica entre 6 y 10 temas de estudio relevantes para la meta. "
        f"Para cada tema incluye 2-3 subtemas, una dificultad (1 fácil .. 5 difícil) "
        f"y una relevancia (0..1) respecto a la meta. "
        f"Nombres de tema de 6 palabras como máximo y subtemas de 8 palabras como máximo, sin descripciones.\n\n"
        f"{adaptive_instructions}"
        f"Devuelve exactamente este esquema JSON:\n{schema}"
    )
