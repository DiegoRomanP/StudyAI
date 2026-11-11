"""Deterministic offline LLM provider.

Selected automatically when no ``ANTHROPIC_API_KEY`` is configured so the whole
StudyAI flow (upload -> plan -> session -> quiz -> SM-2) runs end-to-end for free.
It returns schema-valid JSON per ``kind`` derived from the given ``context`` — no
randomness, so tests are stable. Output is clearly labelled as simulated.
"""

from __future__ import annotations

import json
import unicodedata

from app.core.config import get_settings
from app.llm.base import LLMProvider
from app.llm.prompts.adaptive_session_content import PROFILE_LESSON_KINDS

_LESSON_KIND_COPY = {
    "worked_example": (
        "Ejemplo resuelto",
        "Organiza los datos, elige un procedimiento y comprueba el resultado.",
    ),
    "practice_problem": (
        "Problema para practicar",
        "Resuelve un caso nuevo y explica por qué funciona cada paso.",
    ),
    "context": (
        "Contexto",
        "Sitúa las ideas en su época y relaciona causas con consecuencias.",
    ),
    "source_comparison": (
        "Comparación de fuentes",
        "Contrasta las afirmaciones y explica qué evidencia las respalda.",
    ),
    "guided_reading": (
        "Lectura guiada",
        "Observa las palabras, la voz narrativa y las inferencias del texto.",
    ),
    "textual_evidence": (
        "Evidencia textual",
        "Sustenta una interpretación con detalles concretos del texto.",
    ),
    "system_structure": (
        "Estructura del sistema",
        "Describe los componentes y cómo se relacionan entre sí.",
    ),
    "observation_analysis": (
        "Análisis de observaciones",
        "Relaciona los datos observados con una explicación comprobable.",
    ),
    "case_analysis": (
        "Análisis del caso",
        "Identifica las restricciones del caso y las opciones disponibles.",
    ),
    "decision": (
        "Toma de decisiones",
        "Compara consecuencias y justifica una acción con los datos del caso.",
    ),
    "explanation": ("Explicación", "Define las ideas centrales y muestra cómo se conectan."),
    "practice": ("Práctica", "Aplica las ideas a una situación nueva y revisa el resultado."),
}


class MockLLMProvider(LLMProvider):
    requires_request_pacing = False

    def complete(
        self,
        *,
        kind: str,
        system: str,
        prompt: str,
        context: dict | None = None,
        max_tokens: int = 4096,
    ) -> str:
        ctx = context or {}
        handler = {
            "topic_analysis": self._topics,
            "session_plan": self._sessions,
            "session_content": self._session_content,
        }.get(kind)
        if handler is None:
            return json.dumps({"note": "mock", "kind": kind})
        return json.dumps(handler(ctx))

    # --- per-kind synthesis --------------------------------------------------
    def _topics(self, ctx: dict) -> dict:
        keywords = [k for k in (ctx.get("keywords") or []) if k][:8]
        if not keywords:
            keywords = [
                "Conceptos fundamentales",
                "Definiciones clave",
                "Aplicaciones prácticas",
                "Ejemplos resueltos",
                "Errores comunes",
                "Casos avanzados",
            ]
        topics = []
        for i, name in enumerate(keywords):
            # Deterministic spread of difficulty/relevance so the Pareto filter
            # has a meaningful signal.
            difficulty = (i % 5) + 1
            relevance = round(1.0 - (i / max(len(keywords), 1)) * 0.8, 3)
            topic = {
                "name": str(name)[:120],
                "subtopics": [f"{name} — parte {j + 1}" for j in range(2)],
                "difficulty": difficulty,
                "relevance": relevance,
            }
            if ctx.get("content_version") == 2:
                topic.update(
                    {
                        "topic_profile": self._topic_profile(str(name)),
                        "objectives": [
                            {
                                "id": f"topic-{i + 1}-objective-1",
                                "skill": f"Reconocer las ideas centrales de {name}",
                                "description": f"Explicar una idea central de {name}.",
                                "bloom_target": "understand",
                            }
                        ],
                    }
                )
            topics.append(topic)
        return {"topics": topics}

    @staticmethod
    def _topic_profile(topic_name: str) -> str:
        normalized = unicodedata.normalize("NFKD", topic_name).casefold()
        normalized = "".join(
            character
            for character in normalized
            if not unicodedata.combining(character)
        )
        cues = (
            (("algebra", "fraccion", "matematic", "fisic", "programacion"), "logical_deductive"),
            (("historia", "fuente", "filosofia"), "critical_argumentative"),
            (("literatura", "idioma", "linguistica"), "linguistic_interpretive"),
            (("biologia", "quimic"), "systemic_empirical"),
            (("economia", "negocio"), "applied_practical"),
        )
        for words, profile_id in cues:
            if any(word in normalized for word in words):
                return profile_id
        return "general"

    def _sessions(self, ctx: dict) -> dict:
        intervals = get_settings().REVIEW_INTERVALS_DAYS or [1, 3, 7, 14, 30]
        topics = ctx.get("topics") or []
        sessions = []
        for i, topic in enumerate(topics):
            name = topic if isinstance(topic, str) else topic.get("name", f"Tema {i + 1}")
            sessions.append(
                {
                    "topic_name": name,
                    "review_offset_days": intervals[i % len(intervals)],
                }
            )
        return {"sessions": sessions}

    def _session_content(self, ctx: dict) -> dict:
        topic = ctx.get("topic", "el tema")
        goal = ctx.get("goal_title", "tu objetivo")
        num_flashcards = int(ctx.get("flashcards", 5) or 0)
        num_multiple_choice = int(ctx.get("multiple_choice", 5) or 0)
        if ctx.get("content_version") == 2:
            return self._adaptive_session_content(
                ctx, topic, num_flashcards, num_multiple_choice
            )
        if ctx.get("reinforcement") and ctx.get("failed_points"):
            return self._reinforcement(topic, ctx["failed_points"], num_flashcards, num_multiple_choice)
        markdown = (
            f"# {topic}\n\n"
            f"> _Contenido simulado (modo demo, sin clave de API)._\n\n"
            f"## Resumen\n\n"
            f"Esta sesión cubre **{topic}** en el contexto de *{goal}*. "
            f"Repasa las ideas centrales y cómo se relacionan entre sí.\n\n"
            f"## Explicación\n\n"
            f"1. Define **{topic}** con tus propias palabras.\n"
            f"2. Identifica los componentes o pasos principales.\n"
            f"3. Conecta el concepto con un ejemplo concreto.\n\n"
            f"## Punto clave\n\n"
            f"Si solo recuerdas una cosa de **{topic}**, que sea su idea principal "
            f"y cuándo aplicarla.\n"
        )
        flashcards = [
            {
                "question": f"¿Cuál es la idea principal de {topic}? (tarjeta {i + 1})",
                "answer": f"La idea principal de {topic}, resumida en una frase.",
            }
            for i in range(num_flashcards)
        ]
        multiple_choice = []
        for i in range(num_multiple_choice):
            correct = f"Definición correcta de {topic}"
            options = [
                correct,
                f"Distractor A sobre {topic}",
                f"Distractor B sobre {topic}",
                f"Distractor C sobre {topic}",
            ]
            multiple_choice.append(
                {
                    "question": f"Selecciona la afirmación correcta sobre {topic} ({i + 1}).",
                    "options": options,
                    "answer": correct,
                }
            )
        return {
            "summary_markdown": markdown,
            "youtube_keywords": [f"{topic} explicación", f"{topic} ejemplo", topic],
            "flashcards": flashcards,
            "multiple_choice": multiple_choice,
        }

    @staticmethod
    def _adaptive_session_content(
        ctx: dict,
        topic: str,
        num_flashcards: int,
        num_questions: int,
    ) -> dict:
        snapshot = ctx.get("pedagogy_snapshot") or {}
        objectives = [
            item for item in snapshot.get("objectives", [])
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        ]
        objective_ids = list(dict.fromkeys(item["id"] for item in objectives))
        profile_id = snapshot.get("profile_id", "general")
        block_kinds = PROFILE_LESSON_KINDS.get(
            profile_id, PROFILE_LESSON_KINDS["general"]
        )
        topic_text = str(topic)[:100]
        reinforcement = bool(ctx.get("reinforcement"))
        label = "Refuerzo simulado" if reinforcement else "Contenido simulado"
        failed_points = ctx.get("failed_points") or []
        focus = ""
        if reinforcement and failed_points:
            focus = f" Se revisan {min(len(failed_points), 3)} punto(s) con una explicación y una pregunta nuevas."

        lesson_blocks = []
        for index, kind in enumerate(block_kinds):
            heading, guidance = _LESSON_KIND_COPY.get(
                kind, ("Explicación", "Explica las ideas centrales.")
            )
            lesson_blocks.append(
                {
                    "id": f"simulated-block-{index + 1}",
                    "kind": kind,
                    "objective_ids": objective_ids,
                    "content_markdown": (
                        f"## {heading}\n\n"
                        f"> _{label}, modo demo sin clave de API._\n\n"
                        f"{guidance} Aplica estas ideas al tema y explica "
                        f"cómo ayudan a cumplir el objetivo de aprendizaje.{focus}"
                    ),
                }
            )
        flashcards = [
            {
                "prompt": f"¿Qué idea clave explica {topic_text}? ({index + 1})",
                "answer": f"Respuesta simulada: la idea central de {topic_text}.",
                "objective_ids": objective_ids,
            }
            for index in range(num_flashcards)
        ]

        rubric_criteria = [
            {
                "criterion_id": "razonamiento",
                "description": "La respuesta conecta sus pasos con el objetivo.",
                "descriptors": [
                    "Describe una relación pertinente.",
                    "Explica cómo esa relación apoya la conclusión.",
                ],
            }
        ]
        questions = []
        multiple_choice_index = 0
        for index in range(num_questions):
            if index == 1 and profile_id == "logical_deductive":
                questions.append(
                    {
                        "kind": "step_by_step",
                        "prompt": (
                            f"En un ejemplo de {topic_text}, se sabe que 2 × x = 2. "
                            "Despeja x, indica su valor y justifica el procedimiento."
                        ),
                        "objective_ids": objective_ids,
                        "grading_mode": "numeric",
                        "expected_answer": "1",
                        "rubric_criteria": rubric_criteria,
                        "exemplar": "Se plantea la relación, se despeja la unidad y se verifica el resultado.",
                    }
                )
            elif index == 1 and profile_id in {"critical_argumentative", "linguistic_interpretive"}:
                questions.append(
                    {
                        "kind": "essay",
                        "prompt": f"Argumenta una interpretación de {topic_text} y susténtala con razones pertinentes.",
                        "objective_ids": objective_ids,
                        "rubric_criteria": rubric_criteria,
                        "exemplar": "La respuesta plantea una interpretación, la relaciona con el objetivo y justifica su alcance.",
                    }
                )
            elif index == 1 and profile_id == "systemic_empirical":
                questions.append(
                    {
                        "kind": "matching",
                        "prompt": f"Relaciona cada elemento del análisis de {topic_text}.",
                        "objective_ids": objective_ids,
                        "matching_left": [
                            {"id": "observation", "text": "Observación registrada"},
                            {"id": "explanation", "text": "Explicación propuesta"},
                        ],
                        "matching_right": [
                            {"id": "hypothesis", "text": "Idea comprobable"},
                            {"id": "record", "text": "Dato observado"},
                        ],
                        "matching_pairs": [
                            {"left_id": "observation", "right_id": "record"},
                            {"left_id": "explanation", "right_id": "hypothesis"},
                        ],
                    }
                )
            elif index == 1 and profile_id == "applied_practical":
                questions.append(
                    {
                        "kind": "step_by_step",
                        "prompt": (
                            f"Caso de {topic_text}: hay un presupuesto de 10 unidades. "
                            "La opción A cuesta 4 unidades y dura 2 periodos; la opción B "
                            "cuesta 6 unidades y dura 4. Propón una decisión y justifícala."
                        ),
                        "objective_ids": objective_ids,
                        "grading_mode": "formative",
                        "rubric_criteria": rubric_criteria,
                        "exemplar": "La decisión considera las restricciones del caso y explica sus consecuencias.",
                    }
                )
            elif index % 2 == 0:
                correct_position = (1, 2, 3, 0)[multiple_choice_index % 4]
                multiple_choice_index += 1
                correct = (
                    f"Relaciona la idea central de {topic_text} con el objetivo "
                    f"de la sesión ({index + 1})"
                )
                options = [
                    f"Aplica una regla al caso sin comprobar sus condiciones ({index + 1})",
                    f"Confunde un ejemplo con las condiciones del tema ({index + 1})",
                    f"Describe un detalle aislado sin justificar su relación ({index + 1})",
                ]
                options.insert(correct_position, correct)
                questions.append(
                    {
                        "kind": "multiple_choice",
                        "prompt": f"¿Qué explicación representa mejor {topic_text} y su objetivo? ({index + 1})",
                        "objective_ids": objective_ids,
                        "mode": "single",
                        "options": options,
                        "expected_answer": correct,
                    }
                )
            else:
                questions.append(
                    {
                        "kind": "true_false",
                        "prompt": f"{topic_text} se explica con los objetivos de esta sesión. ({index + 1})",
                        "objective_ids": objective_ids,
                        "expected_answer": True,
                    }
                )
        return {
            "lesson_blocks": lesson_blocks,
            "youtube_keywords": [f"{topic_text} explicación", f"{topic_text} práctica"],
            "flashcards": flashcards,
            "questions": questions,
            "stimuli": [],
        }

    def _reinforcement(self, topic: str, points: list[dict], num_flashcards: int, num_multiple_choice: int) -> dict:
        """Deterministic reinforcement built from the failed points (demo mode)."""
        markdown = f"# Refuerzo: {topic}\n\n> _Contenido simulado (modo demo, sin clave de API)._\n\n"
        for point in points:
            markdown += (
                f"## {point.get('prompt', '')}\n\n**Respuesta:** {point.get('answer', '')}\n\n"
                "Explicación simulada con otras palabras y un ejemplo.\n\n"
            )
        flashcards = [
            {
                "question": f"Refuerzo: {points[i % len(points)].get('prompt', '')}",
                "answer": points[i % len(points)].get("answer", ""),
            }
            for i in range(num_flashcards)
        ]
        multiple_choice = []
        for i in range(num_multiple_choice):
            point = points[i % len(points)]
            correct = point.get("answer", "")
            multiple_choice.append(
                {
                    "question": f"Refuerzo: {point.get('prompt', '')}",
                    "options": [correct, f"Distractor A sobre {topic}", f"Distractor B sobre {topic}", f"Distractor C sobre {topic}"],
                    "answer": correct,
                }
            )
        return {
            "summary_markdown": markdown,
            "youtube_keywords": [f"{topic} refuerzo", topic],
            "flashcards": flashcards,
            "multiple_choice": multiple_choice,
        }
