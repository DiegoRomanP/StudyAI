"""Goal strategies (Strategy Pattern).

Each goal type shapes how a plan is generated: the weighting hint added to the
topic-analysis prompt and the session configuration (duration, how many
flashcards vs. multiple-choice questions to emphasise).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class SessionConfig:
    duration_minutes: int
    flashcards: int
    multiple_choice: int
    emphasis: str


class GoalStrategy(ABC):
    @abstractmethod
    def get_weighting_prompt(self) -> str:
        """Extra instruction appended to the topic-analysis prompt."""

    @abstractmethod
    def get_session_config(self) -> SessionConfig:
        """Per-session configuration for this goal type."""
