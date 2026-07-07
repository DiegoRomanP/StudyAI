"""Pareto (80/20) topic selection.

Keeps the most relevant ~20% of topics so study effort concentrates on the
highest-yield material, with sensible floors/ceilings so a plan is never empty
or unwieldy.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import TypeVar

T = TypeVar("T")


def select_top_by_relevance(
    items: Sequence[T],
    relevance: "callable",
    *,
    fraction: float = 0.2,
    minimum: int = 3,
    maximum: int = 10,
) -> list[T]:
    """Return the top ``fraction`` of ``items`` ranked by ``relevance``.

    Args:
        items: candidate items.
        relevance: callable mapping an item to a numeric relevance score.
        fraction: keep this fraction (0..1) of items (Pareto ≈ 0.2).
        minimum: never return fewer than this (unless fewer items exist).
        maximum: never return more than this.
    """
    if not items:
        return []
    ranked = sorted(items, key=relevance, reverse=True)
    target = math.ceil(len(ranked) * fraction)
    target = max(minimum, target)
    target = min(maximum, target, len(ranked))
    return ranked[:target]
