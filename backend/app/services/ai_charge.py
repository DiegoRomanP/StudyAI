"""What one AI request cost, and how to give it back.

``self_hosted``: one use of the daily free-tier quota (``FreeAiQuota``), remembered by its UTC day (a ``date``).
``saas``: one credit (``CreditService``), remembered by its ledger id. Either way the refund is
exactly-once and never raises, so bookkeeping cannot hide the real outcome of a failed job.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models.credit_ledger import CreditReason
from app.repositories.credit_repository import CreditRepository
from app.services.credit_service import CreditService
from app.services.free_ai_quota import FreeAiQuota

logger = get_logger(__name__)


@dataclass(frozen=True)
class AiCharge:
    """saas: the credit's ledger row. (self_hosted keeps passing the UTC ``date`` of the spent free use.)"""

    ledger_id: int


def charge_reinforcement_credit(db: Session, user_id: int, session_id: int) -> AiCharge:
    """Spend one credit for an AI reinforcement; ``InsufficientCreditsError`` leaves everything untouched."""
    # The claim (NONE/FAILED -> PROCESSING) is atomic, so attempts are serial: the key is unique per attempt.
    attempt = CreditRepository(db).count_charges("session", session_id) + 1
    return AiCharge(
        CreditService(db).consume(
            user_id, reason=CreditReason.REINFORCEMENT, reference_type="session", reference_id=session_id,
            idempotency_key=f"reinforcement:{session_id}:{attempt}",
        )
    )


def refund_charge(db: Session, user_id: int, spent: date | AiCharge | None) -> None:
    """Give back a free use (on the day it was spent) or a credit. Never raises."""
    if spent is None:
        return
    try:
        if isinstance(spent, AiCharge):
            CreditService(db).refund(spent.ledger_id)
        else:
            FreeAiQuota(db).refund(user_id, spent)
    except Exception:  # noqa: BLE001 - bookkeeping must never hide the real outcome
        db.rollback()
        logger.warning("Could not refund the AI charge for user %s", user_id)
