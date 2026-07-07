"""Unit tests for goal strategies and the Pareto selector."""

import pytest

from app.core.exceptions import ValidationError
from app.models.goal import GoalType
from app.algorithms.pareto import select_top_by_relevance
from app.strategies.goal_strategies import (
    ExamStrategy,
    GoalStrategyFactory,
    LearningStrategy,
    MemorizationStrategy,
)


def test_factory_returns_correct_strategy():
    assert isinstance(GoalStrategyFactory.create(GoalType.EXAM), ExamStrategy)
    assert isinstance(GoalStrategyFactory.create(GoalType.LEARNING), LearningStrategy)
    assert isinstance(
        GoalStrategyFactory.create(GoalType.MEMORIZATION), MemorizationStrategy
    )


def test_strategies_have_distinct_prompts_and_configs():
    prompts = {
        GoalStrategyFactory.create(t).get_weighting_prompt()
        for t in (GoalType.EXAM, GoalType.LEARNING, GoalType.MEMORIZATION)
    }
    assert len(prompts) == 3  # all distinct

    exam = ExamStrategy().get_session_config()
    memo = MemorizationStrategy().get_session_config()
    # Exam emphasises multiple choice; memorization emphasises flashcards.
    assert exam.multiple_choice > exam.flashcards
    assert memo.flashcards > memo.multiple_choice


def test_unknown_goal_type_raises():
    with pytest.raises(ValidationError):
        GoalStrategyFactory.create("SOMETHING_ELSE")  # type: ignore[arg-type]


def test_pareto_reduces_to_roughly_20_percent():
    items = [{"r": i / 10} for i in range(10)]  # 10 items, relevance 0.0..0.9
    top = select_top_by_relevance(items, relevance=lambda x: x["r"])
    # ceil(10 * 0.2) = 2, but the floor is `minimum=3`.
    assert len(top) == 3
    assert top[0]["r"] == 0.9  # highest relevance first
