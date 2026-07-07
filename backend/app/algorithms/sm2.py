"""SuperMemo-2 (SM-2) spaced-repetition scheduling.

Pure function with no I/O so it is trivially unit-testable. Follows the classic
SM-2 formulation:

    * ``quality`` (q) is the learner's self-rating 0..5.
    * If q < 3 the item is considered lapsed: repetitions reset and the interval
      goes back to 1 day.
    * The easiness factor (EF) is always updated and floored at 1.3.

Reference: https://super-memory.com/english/ol/sm2.htm
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

MIN_EASINESS_FACTOR = 1.3
FIRST_INTERVAL_DAYS = 1
SECOND_INTERVAL_DAYS = 6
PASSING_QUALITY = 3


@dataclass(frozen=True)
class SM2Result:
    new_ef: float
    new_interval: int
    next_review_date: date
    new_repetition_count: int


def calculate_next_review(
    easiness_factor: float,
    interval_days: int,
    repetition_count: int,
    quality: int,
    *,
    today: date | None = None,
) -> SM2Result:
    """Compute the next SM-2 review schedule.

    Args:
        easiness_factor: current EF (>= 1.3).
        interval_days: current inter-repetition interval in days.
        repetition_count: number of consecutive successful recalls so far.
        quality: recall quality for this review, 0..5.
        today: injectable "today" for deterministic tests (defaults to UTC date).

    Returns:
        SM2Result with the updated schedule.
    """
    if not 0 <= quality <= 5:
        raise ValueError("quality must be in the range 0..5")

    reference = today or datetime.now(timezone.utc).date()

    # EF is updated on every review, regardless of pass/fail.
    new_ef = easiness_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    new_ef = max(MIN_EASINESS_FACTOR, new_ef)

    if quality < PASSING_QUALITY:
        # Lapse: restart the repetition chain.
        new_repetition_count = 0
        new_interval = FIRST_INTERVAL_DAYS
    else:
        new_repetition_count = repetition_count + 1
        if new_repetition_count == 1:
            new_interval = FIRST_INTERVAL_DAYS
        elif new_repetition_count == 2:
            new_interval = SECOND_INTERVAL_DAYS
        else:
            new_interval = round(interval_days * new_ef)

    next_review_date = reference + _timedelta_days(new_interval)
    return SM2Result(
        new_ef=round(new_ef, 4),
        new_interval=new_interval,
        next_review_date=next_review_date,
        new_repetition_count=new_repetition_count,
    )


def _timedelta_days(days: int):
    from datetime import timedelta

    return timedelta(days=days)
