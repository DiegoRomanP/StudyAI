"""Daily limit on the included free-tier AI: ``FREE_AI_DAILY_LIMIT`` plan generations per user.

A "use" is one plan generation (``2 + N`` LLM calls). It is spent when the plan is requested
and given back if generation fails, so a provider outage never burns the learner's day.
Days follow UTC, like every other timestamp in the app.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import DailyLimitError
from app.llm.factory import resolve_llm_provider
from app.models.free_ai_usage import FreeAiUsage

_LIMIT_MESSAGE = (
    "Ya usaste tus {limit} planes gratis de hoy. Conecta tu propia IA en «Conectar IA» "
    "o vuelve mañana."
)


@dataclass(frozen=True)
class FreeAiStatus:
    limit: int
    used: int

    @property
    def remaining(self) -> int:
        return max(self.limit - self.used, 0)


def uses_free_ai(db: Session, user_id: int) -> bool:
    """Whether the next generation for this learner runs on the included free-tier AI."""
    resolution = resolve_llm_provider(db, user_id)
    resolution.provider.close()
    return resolution.runtime.bundled


def _today():
    return datetime.now(timezone.utc).date()


class FreeAiQuota:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.limit = get_settings().FREE_AI_DAILY_LIMIT

    def _row(self, user_id: int) -> FreeAiUsage | None:
        return self.db.scalar(
            select(FreeAiUsage).where(
                FreeAiUsage.user_id == user_id, FreeAiUsage.usage_date == _today()
            )
        )

    def status(self, user_id: int) -> FreeAiStatus:
        row = self._row(user_id)
        return FreeAiStatus(limit=self.limit, used=row.uses if row else 0)

    def consume(self, user_id: int) -> None:
        """Spend one use or raise ``DailyLimitError``; the increment is atomic in SQL."""
        if self._row(user_id) is None:
            try:
                self.db.add(FreeAiUsage(user_id=user_id, usage_date=_today(), uses=0))
                self.db.commit()
            except IntegrityError:  # a concurrent request created today's row first
                self.db.rollback()
        spent = self.db.execute(
            update(FreeAiUsage)
            .where(
                FreeAiUsage.user_id == user_id,
                FreeAiUsage.usage_date == _today(),
                FreeAiUsage.uses < self.limit,
            )
            .values(uses=FreeAiUsage.uses + 1)
        )
        self.db.commit()
        if spent.rowcount == 0:
            raise DailyLimitError(_LIMIT_MESSAGE.format(limit=self.limit), code="FREE_AI_DAILY_LIMIT")

    def refund(self, user_id: int) -> None:
        self.db.execute(
            update(FreeAiUsage)
            .where(
                FreeAiUsage.user_id == user_id,
                FreeAiUsage.usage_date == _today(),
                FreeAiUsage.uses > 0,
            )
            .values(uses=FreeAiUsage.uses - 1)
        )
        self.db.commit()
