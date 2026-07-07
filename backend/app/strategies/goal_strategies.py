"""Concrete goal strategies and their factory."""

from __future__ import annotations

from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.models.goal import GoalType
from app.strategies.base import GoalStrategy, SessionConfig


def _default_duration() -> int:
    return get_settings().SESSION_DURATION_MINUTES


class ExamStrategy(GoalStrategy):
    """Optimise for exam performance: prioritise high-yield, testable topics."""

    def get_weighting_prompt(self) -> str:
        return (
            "El estudiante busca aprobar un examen: prioriza los temas con mayor "
            "probabilidad de ser evaluados y mayor peso en la nota."
        )

    def get_session_config(self) -> SessionConfig:
        return SessionConfig(
            duration_minutes=_default_duration(),
            flashcards=3,
            multiple_choice=7,
            emphasis="práctica de preguntas tipo examen",
        )


class LearningStrategy(GoalStrategy):
    """Optimise for understanding: balanced coverage and conceptual depth."""

    def get_weighting_prompt(self) -> str:
        return (
            "El estudiante quiere comprender el material a fondo: prioriza la "
            "comprensión conceptual y las conexiones entre temas."
        )

    def get_session_config(self) -> SessionConfig:
        return SessionConfig(
            duration_minutes=_default_duration(),
            flashcards=5,
            multiple_choice=5,
            emphasis="comprensión conceptual",
        )


class MemorizationStrategy(GoalStrategy):
    """Optimise for retention: heavy flashcard emphasis for spaced repetition."""

    def get_weighting_prompt(self) -> str:
        return (
            "El estudiante necesita memorizar: prioriza definiciones, datos y "
            "hechos concretos aptos para repetición espaciada."
        )

    def get_session_config(self) -> SessionConfig:
        return SessionConfig(
            duration_minutes=_default_duration(),
            flashcards=8,
            multiple_choice=2,
            emphasis="memorización con flashcards",
        )


_REGISTRY: dict[GoalType, type[GoalStrategy]] = {
    GoalType.EXAM: ExamStrategy,
    GoalType.LEARNING: LearningStrategy,
    GoalType.MEMORIZATION: MemorizationStrategy,
}


class GoalStrategyFactory:
    @staticmethod
    def create(goal_type: GoalType) -> GoalStrategy:
        strategy_cls = _REGISTRY.get(goal_type)
        if strategy_cls is None:
            raise ValidationError(f"No strategy for goal type '{goal_type}'.")
        return strategy_cls()
