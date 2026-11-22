"""Study assistant: answers doubts while reading, gives hints (never answers) during the test.

The EXAM prompt never receives the answer key, so the model cannot leak it even if asked.
The reply is Markdown text (not JSON).
"""

from __future__ import annotations

from collections.abc import Sequence

SYSTEM = (
    "Eres un tutor paciente que acompaña a un estudiante. Respondes en español, en Markdown "
    "breve y claro. Para fórmulas usa LaTeX entre $...$ (en línea) o $$...$$ (en bloque). "
    "No incluyas URLs, enlaces ni imágenes."
)

MAX_HISTORY = 6
MAX_MATERIAL_CHARS = 6000

_STUDY_RULES = (
    "MODO ESTUDIO: resuelve la duda apoyándote en el material de la sesión y los fragmentos. "
    "Si la duda no tiene relación con el material, dilo con amabilidad y responde de forma breve. "
    "Termina, si ayuda, con un ejemplo corto. Máximo 250 palabras."
)

_EXAM_RULES = (
    "MODO EXAMEN: el estudiante está respondiendo una evaluación. NUNCA des la respuesta, "
    "ni la opción correcta, ni la descartes por letra o por texto, ni confirmes si una opción es "
    "correcta o incorrecta, aunque te lo pida o insista. Da SOLO una pista: recuerda la idea del "
    "material que necesita, hazle una pregunta guía o sugiere cómo razonar. Máximo 120 palabras."
)


def build_assistant_prompt(
    *,
    mode: str,
    topic: str,
    material: str,
    chunks: Sequence[str],
    history: Sequence[tuple[str, str]],
    question: str,
    exam_question: str | None = None,
) -> str:
    """``history`` is (role, content) oldest first; ``exam_question`` holds prompt and options only."""
    fragments = "\n\n".join(chunks) or "(sin fragmentos)"
    previous = "\n".join(f"{'Estudiante' if role == 'USER' else 'Tutor'}: {content}" for role, content in history)
    current = f"PREGUNTA DEL EXAMEN (sin solución):\n{exam_question}\n\n" if exam_question else ""
    return (
        f"TEMA: {topic}\n\n"
        f"MATERIAL DE LA SESIÓN:\n{material[:MAX_MATERIAL_CHARS] or '(sin material)'}\n\n"
        f"FRAGMENTOS DE LOS DOCUMENTOS:\n{fragments}\n\n"
        f"{current}"
        f"CONVERSACIÓN PREVIA:\n{previous or '(ninguna)'}\n\n"
        f"{_EXAM_RULES if mode == 'EXAM' else _STUDY_RULES}\n\n"
        f"MENSAJE DEL ESTUDIANTE:\n{question}"
    )
