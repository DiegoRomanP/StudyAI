"""Credit ledger persistence."""

from __future__ import annotations

from sqlalchemy import func, select

from app.models.credit_ledger import CreditLedger, CreditReason
from app.repositories.base import BaseRepository


class CreditRepository(BaseRepository[CreditLedger]):
    model = CreditLedger

    def find_id_by_key(self, idempotency_key: str) -> int | None:
        return self.db.scalar(select(CreditLedger.id).where(CreditLedger.idempotency_key == idempotency_key))

    def has_purchase(self, user_id: int) -> bool:
        return (
            self.db.scalar(
                select(CreditLedger.id)
                .where(CreditLedger.user_id == user_id, CreditLedger.reason == CreditReason.PURCHASE)
                .limit(1)
            )
            is not None
        )

    def count_charges(self, reference_type: str, reference_id: int) -> int:
        """Charges ever made for one reference (a reinforcement's attempt number)."""
        return self.db.scalar(
            select(func.count()).where(
                CreditLedger.reference_type == reference_type,
                CreditLedger.reference_id == reference_id,
                CreditLedger.delta < 0,
            )
        ) or 0

    def history(self, user_id: int, limit: int) -> list[CreditLedger]:
        stmt = (
            select(CreditLedger)
            .where(CreditLedger.user_id == user_id)
            .order_by(CreditLedger.id.desc())
            .limit(limit)
        )
        return list(self.db.scalars(stmt).all())
