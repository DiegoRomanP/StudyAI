"""Prompt for the merged LLM call that produces a session's study material AND
its quiz in one request.

Previously two separate calls (content then quiz) per session — merging them
halves the number of per-session LLM calls the plan-generation pipeline makes,
which matters a lot for rate-limited free-tier providers. Flashcard/multiple-
choice counts are parameterised by the goal strategy's ``SessionConfig``
instead of a hardcoded "5 and 5" that then got truncated client-side to
whatever the strategy actually wanted.
"""

from __future__ import annotations

SYSTEM = (
    "Eres un tutor que redacta material de estudio y genera evaluaciones de "
    "refuerzo. Respondes ÚNICAMENTE con JSON válido, sin texto adicional ni "
    "fences de markdown."
)

SCHEMA_TEMPLATE = """{{
  "summary_markdown": "string (markdown: resumen, explicación y punto clave)",
  "youtube_keywords": ["string", "..."],
  "flashcards": [
    {{ "question": "string", "answer": "string" }}
  ],
  "multiple_choice": [
    {{
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answer": "string (debe coincidir EXACTAMENTE con una opción)"
    }}
  ]
}}"""

_SCHEMA_TEMPLATE = SCHEMA_TEMPLATE  # backwards-compatible alias

# Bounded lengths keep each session near 1.6-1.9k output tokens.
QUIZ_LENGTH_LIMITS = (
    "Cada flashcard: pregunta de 20 palabras como máximo y respuesta de 30 como máximo. "
    "Cada pregunta de opción múltiple: enunciado de 30 palabras como máximo y opciones de 12 palabras como máximo."
)


def build_session_content_prompt(
    topic: str,
    goal: str,
    chunks: list[str],
    flashcards: int,
    multiple_choice: int,
) -> str:
    material = "\n\n".join(chunks[:4]) if chunks else "(sin material adicional)"
    return (
        f"META:\n{goal}\n\n"
        f"TEMA DE LA SESIÓN:\n{topic}\n\n"
        f"MATERIAL DE REFERENCIA:\n{material}\n\n"
        f"Redacta material de estudio en Markdown con: (1) un resumen breve, "
        f"(2) una explicación estructurada y (3) un punto clave para recordar. "
        f"Añade 2-4 'youtube_keywords' útiles para buscar videos (NO URLs).\n\n"
        f"Además, crea EXACTAMENTE {flashcards} flashcards y {multiple_choice} "
        f"preguntas de opción múltiple (4 opciones cada una) sobre el tema. En "
        f"cada pregunta de opción múltiple, 'answer' debe coincidir exactamente "
        f"con una de las 'options'.\n\n"
        "Extensión: 'summary_markdown' entre 250 y 400 palabras en total (resumen de 80 palabras como máximo, "
        "explicación en 3 a 5 apartados breves y punto clave en 1 o 2 frases). "
        f"{QUIZ_LENGTH_LIMITS}\n\n"
        f"Devuelve exactamente este esquema JSON:\n{SCHEMA_TEMPLATE}"
    )
