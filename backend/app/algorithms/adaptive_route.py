"""Adaptive study route: mastery, review boxes and review ordering.

Pure functions with no I/O, clock or ORM, like ``sm2.py`` and ``pareto.py``.

    * Every topic starts at the same mastery (0.5): the learner is assumed equal everywhere.
    * Each exam yields a score in 0..1 (multiple choice counts 1, a self-rated
      flashcard counts half) and mastery follows a moving average that weighs the
      latest exam 60 %.
    * A Leitner box over the Ebbinghaus ladder decides when to review: a good exam
      climbs one step, a bad one falls back to the first.
"""

from __future__ import annotations

import random
from collections.abc import Iterable, Mapping, Sequence

UNKNOWN_MASTERY = 0.5          # "same level for every topic"
LATEST_EXAM_WEIGHT = 0.6       # m' = 0.6·score + 0.4·m
FLASHCARD_WEIGHT = 0.5         # self-rated, so it weighs half a multiple choice
REINFORCE_BELOW = 0.6          # score / mastery under this → reinforce, box back to 0
PROMOTE_AT = 0.8               # score at or over this climbs a box
MASTERED_BOX = 3               # box at or over this → mastered
REVIEW_PASS_QUALITY = 4        # a flashcard rated under this is reviewed (stricter than SM-2's lapse at 3)
DEFAULT_LADDER = (1, 3, 7, 14, 30)

SIN_DATOS, REFORZAR, EN_PROGRESO, DOMINADO = "SIN_DATOS", "REFORZAR", "EN_PROGRESO", "DOMINADO"


def normalize(name: str) -> str:
    """Comparable topic name: collapsed whitespace, case-folded."""
    return " ".join(str(name).split()).casefold()


def effective_ladder(ladder: Sequence[int]) -> tuple[int, ...]:
    """The configured ladder if it has enough positive steps; otherwise the default."""
    steps = tuple(int(step) for step in ladder)
    if len(steps) > MASTERED_BOX and all(step > 0 for step in steps):
        return steps
    return DEFAULT_LADDER


def is_adaptive_result(detail: Mapping[str, object]) -> bool:
    meta = detail.get("_meta")
    return isinstance(meta, Mapping) and meta.get("type") == "_meta" and meta.get("schema_version") == 2


def adaptive_objective_grades(detail: Mapping[str, object]) -> dict[str, bool]:
    grades: dict[str, bool] = {}
    for question_id, entry in detail.items():
        if isinstance(entry, Mapping) and entry.get("objective") is True:
            correct = entry.get("correct")
            if isinstance(correct, bool):
                grades[question_id] = correct
    return grades


def failed_adaptive_keys(detail: Mapping[str, object]) -> set[str]:
    """v2 items to review: wrong objective items and flashcards rated under ``REVIEW_PASS_QUALITY``."""
    failed = {key for key, correct in adaptive_objective_grades(detail).items() if not correct}
    failed.update(
        key
        for key, entry in detail.items()
        if isinstance(entry, Mapping)
        and entry.get("type") == "flashcard"
        and int(entry.get("quality") or 0) < REVIEW_PASS_QUALITY
    )
    return failed


def exam_score(detail: Mapping[str, object]) -> float | None:
    """Exam score in 0..1 from a ``QuizResult.detail``; None when nothing was answered."""
    if is_adaptive_result(detail):
        grades = adaptive_objective_grades(detail)
        if grades:
            return sum(grades.values()) / len(grades)
        # A review left with only flashcards: recalled (>= REVIEW_PASS_QUALITY) over rated.
        cards = [
            int(entry.get("quality") or 0) >= REVIEW_PASS_QUALITY
            for entry in detail.values()
            if isinstance(entry, Mapping) and entry.get("type") == "flashcard"
        ]
        return sum(cards) / len(cards) if cards else None

    earned = 0.0
    total = 0.0
    for entry in detail.values():
        if not isinstance(entry, Mapping):
            continue
        kind = entry.get("type")
        if kind == "multiple_choice":
            earned += 1.0 if entry.get("correct") else 0.0
            total += 1.0
        elif kind == "flashcard":
            quality = min(max(float(entry.get("quality") or 0), 0.0), 5.0)
            earned += FLASHCARD_WEIGHT * quality / 5
            total += FLASHCARD_WEIGHT
    return earned / total if total else None


def failed_question_ids(detail: Mapping[str, Mapping]) -> set[int]:
    """Questions to reinforce: wrong multiple choice or a flashcard rated under 4."""
    failed: set[int] = set()
    for key, entry in detail.items():
        if not isinstance(entry, Mapping):
            continue
        kind = entry.get("type")
        if kind == "multiple_choice" and not entry.get("correct"):
            failed.add(int(key))
        elif kind == "flashcard" and int(entry.get("quality") or 0) < REVIEW_PASS_QUALITY:
            failed.add(int(key))
    return failed


def update_topic(
    mastery: float | None,
    box: int,
    score: float,
    *,
    promote_allowed: bool,
    ladder: Sequence[int],
) -> tuple[float, int]:
    """New ``(mastery, box)`` after an exam. Early reviews update mastery but never climb."""
    previous = UNKNOWN_MASTERY if mastery is None else mastery
    new_mastery = round(LATEST_EXAM_WEIGHT * score + (1 - LATEST_EXAM_WEIGHT) * previous, 4)
    if score < REINFORCE_BELOW:
        return new_mastery, 0
    if score >= PROMOTE_AT and promote_allowed:
        return new_mastery, min(box + 1, len(effective_ladder(ladder)) - 1)
    return new_mastery, box


def topic_state(mastery: float | None, box: int) -> str:
    if mastery is None:
        return SIN_DATOS
    if box >= MASTERED_BOX:
        return DOMINADO
    if mastery < REINFORCE_BELOW:
        return REFORZAR
    return EN_PROGRESO


def review_interval_days(box: int, ladder: Sequence[int]) -> int:
    steps = effective_ladder(ladder)
    return steps[min(max(box, 0), len(steps) - 1)]


def priority(relevance: float, mastery: float | None) -> float:
    """High value and low mastery first: ``relevance × (1 − mastery)``."""
    known = UNKNOWN_MASTERY if mastery is None else mastery
    return round(min(max(relevance, 0.0), 1.0) * (1 - known), 4)


def order_for_review(question_ids: Sequence[int], failed_ids: Iterable[int]) -> list[int]:
    """Failed questions first; each group keeps its original order."""
    failed = set(failed_ids)
    return [q for q in question_ids if q in failed] + [q for q in question_ids if q not in failed]


def shuffled_options(options: Sequence[str], seed: str) -> list[str]:
    """Deterministic shuffle of a copy (``str`` seeds use SHA-512, not PYTHONHASHSEED)."""
    shuffled = list(options)
    random.Random(seed).shuffle(shuffled)
    return shuffled
