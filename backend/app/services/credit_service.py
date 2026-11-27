"""Credits (saas): an append-only ledger plus two cached balances on ``users``.

Spending is atomic in SQL (conditional UPDATE, like ``FreeAiQuota``) and idempotent per key,
so a double click or a network retry never charges twice. Every method commits on its own.
The valid monthly pass is spent before purchased credits.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import InsufficientCreditsError, PlanLimitError
from app.models.credit_ledger import CreditLedger, CreditReason, CreditSource
from app.models.user import User
from app.repositories.credit_repository import CreditRepository
from app.repositories.document_repository import DocumentRepository
from app.repositories.goal_repository import GoalRepository

Tier = Literal["free", "credits", "pass"]
# tier -> (max documents, max active goals); None = unlimited. Only enforced in saas.
TIER_LIMITS: dict[str, tuple[int | None, int | None]] = {
    "free": (3, 2),
    "credits": (30, 10),
    "pass": (100, None),
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC, like the timestamp columns


@dataclass(frozen=True)
class CreditBalance:
    purchased: int
    pass_credits: int  # 0 once the pass has expired
    pass_expires_at: datetime | None
    tier: Tier
    max_documents: int | None
    max_active_goals: int | None
    documents_used: int
    active_goals_used: int

    @property
    def total(self) -> int:
        return self.purchased + self.pass_credits


class CreditService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = CreditRepository(db)

    def _columns(self, user_id: int):
        """Fresh balance columns (the ORM ``User`` may be stale after our own UPDATEs)."""
        return self.db.execute(
            select(User.credit_balance, User.pass_credits, User.pass_expires_at).where(User.id == user_id)
        ).one()

    def balance(self, user_id: int) -> CreditBalance:
        row = self._columns(user_id)
        pass_valid = row.pass_expires_at is not None and row.pass_expires_at > _now()
        tier: Tier = "pass" if pass_valid else "credits" if self.repo.has_purchase(user_id) else "free"
        max_documents, max_goals = TIER_LIMITS[tier] if get_settings().is_saas else (None, None)
        return CreditBalance(
            purchased=row.credit_balance,
            pass_credits=row.pass_credits if pass_valid else 0,
            pass_expires_at=row.pass_expires_at,
            tier=tier,
            max_documents=max_documents,
            max_active_goals=max_goals,
            documents_used=DocumentRepository(self.db).count_for_user(user_id),
            active_goals_used=GoalRepository(self.db).count_active(user_id),
        )

    def ensure_document_slot(self, user_id: int) -> None:
        limit = self.balance(user_id).max_documents
        if limit is not None and DocumentRepository(self.db).count_for_user(user_id) >= limit:
            raise PlanLimitError(f"Tu plan permite hasta {limit} documentos.")

    def ensure_goal_slot(self, user_id: int) -> None:
        limit = self.balance(user_id).max_active_goals
        if limit is not None and GoalRepository(self.db).count_active(user_id) >= limit:
            raise PlanLimitError(f"Tu plan permite hasta {limit} metas activas. Archiva una para crear otra.")

    def history(self, user_id: int, limit: int = 50) -> list[CreditLedger]:
        return self.repo.history(user_id, limit)

    def consume(
        self, user_id: int, *, reason: CreditReason, reference_type: str, reference_id: int,
        idempotency_key: str,
    ) -> int:
        """Spend one credit and return its ledger id; raise ``InsufficientCreditsError`` with nothing spent."""
        existing = self.repo.find_id_by_key(idempotency_key)
        if existing is not None:
            return existing
        for source, column, conditions in (
            (CreditSource.PASS, User.pass_credits, (User.pass_credits >= 1, User.pass_expires_at > _now())),
            (CreditSource.PURCHASED, User.credit_balance, (User.credit_balance >= 1,)),
        ):
            spent = self.db.execute(
                update(User)
                .where(User.id == user_id, *conditions)
                .values({column: column - 1})
                .execution_options(synchronize_session=False)
            )
            if spent.rowcount:
                return self._record(user_id, -1, reason, source, reference_type, reference_id, idempotency_key)
        self.db.rollback()
        raise InsufficientCreditsError

    def refund(self, charge_id: int) -> None:
        """Give a charge back to the pot it came from. Once only: the key is ``refund:{charge_id}``."""
        charge = self.db.get(CreditLedger, charge_id)
        if charge is None or charge.delta >= 0:
            return
        # shortcut: a pass refund goes back to pass_credits even if the pass expired meanwhile
        self.grant(
            charge.user_id, delta=-charge.delta, reason=CreditReason.REFUND, source=charge.source,
            idempotency_key=f"refund:{charge_id}", reference_type=charge.reference_type,
            reference_id=charge.reference_id,
        )

    def grant(
        self, user_id: int, *, delta: int, reason: CreditReason, source: CreditSource,
        idempotency_key: str, reference_type: str | None = None, reference_id: int | None = None,
    ) -> int:
        existing = self.repo.find_id_by_key(idempotency_key)
        if existing is not None:
            return existing
        column = User.pass_credits if source is CreditSource.PASS else User.credit_balance
        self.db.execute(
            update(User).where(User.id == user_id).values({column: column + delta})
            .execution_options(synchronize_session=False)
        )
        return self._record(user_id, delta, reason, source, reference_type, reference_id, idempotency_key)

    def grant_pass(
        self, user_id: int, *, credits: int, days: int, idempotency_key: str,
        reference_type: str | None = None, reference_id: int | None = None,
    ) -> int:
        """Start or extend the monthly pass: its credits reset to ``credits`` (they never stack) and the
        expiry moves to ``max(now, current expiry) + days``. Idempotent per key."""
        existing = self.repo.find_id_by_key(idempotency_key)
        if existing is not None:
            return existing
        current = self._columns(user_id).pass_expires_at
        expires = max(_now(), current or _now()) + timedelta(days=days)
        self.db.execute(
            update(User).where(User.id == user_id).values(pass_credits=credits, pass_expires_at=expires)
            .execution_options(synchronize_session=False)
        )
        return self._record(
            user_id, credits, CreditReason.PASS_GRANT, CreditSource.PASS, reference_type, reference_id,
            idempotency_key,
        )

    def _record(
        self, user_id: int, delta: int, reason: CreditReason, source: CreditSource,
        reference_type: str | None, reference_id: int | None, idempotency_key: str,
    ) -> int:
        """Insert the ledger row in the same transaction as the balance change, then commit both."""
        row = self._columns(user_id)
        pass_valid = row.pass_expires_at is not None and row.pass_expires_at > _now()
        entry = CreditLedger(
            user_id=user_id, delta=delta, reason=reason, source=source, reference_type=reference_type,
            reference_id=reference_id, idempotency_key=idempotency_key,
            balance_after=row.credit_balance + (row.pass_credits if pass_valid else 0),
        )
        self.db.add(entry)
        try:
            self.db.commit()
        except IntegrityError:  # a concurrent request used the same key first: its row wins, ours rolls back
            self.db.rollback()
            existing = self.repo.find_id_by_key(idempotency_key)
            if existing is None:
                raise
            return existing
        return entry.id
