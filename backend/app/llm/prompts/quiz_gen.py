"""Prompt for LLM call #3b — generate a quiz for one session.

5 flashcards + 5 multiple-choice questions per session.
"""

from __future__ import annotations

SYSTEM = (
    "Eres un generador de evaluaciones. Creas flashcards y preguntas de opción "
    "múltiple para reforzar el aprendizaje. Respondes ÚNICAMENTE con JSON válido."
)

_SCHEMA = """{
  "flashcards": [
    { "question": "string", "answer": "string" }
  ],
  "multiple_choice": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answer": "string (debe coincidir EXACTAMENTE con una opción)"
    }
  ]
}"""


def build_quiz_prompt(topic: str, chunks: list[str]) -> str:
    material = "\n\n".join(chunks[:4]) if chunks else "(sin material adicional)"
    return (
        f"TEMA:\n{topic}\n\n"
        f"MATERIAL DE REFERENCIA:\n{material}\n\n"
        f"Crea EXACTAMENTE 5 flashcards y 5 preguntas de opción múltiple (4 "
        f"opciones cada una) sobre el tema. En cada pregunta de opción múltiple, "
        f"'answer' debe coincidir exactamente con una de las 'options'.\n\n"
        f"Devuelve exactamente este esquema JSON:\n{_SCHEMA}"
    )
