"""Deterministic offline LLM provider.

Selected automatically when no ``ANTHROPIC_API_KEY`` is configured so the whole
StudyAI flow (upload -> plan -> session -> quiz -> SM-2) runs end-to-end for free.
It returns schema-valid JSON per ``kind`` derived from the given ``context`` — no
randomness, so tests are stable. Output is clearly labelled as simulated.
"""

from __future__ import annotations

import json

from app.core.config import get_settings
from app.llm.base import LLMProvider


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
            topics.append(
                {
                    "name": str(name)[:120],
                    "subtopics": [f"{name} — parte {j + 1}" for j in range(2)],
                    "difficulty": difficulty,
                    "relevance": relevance,
                }
            )
        return {"topics": topics}

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
