"""What one AI request cost, and how to give it back.

``self_hosted``: one use of the daily free-tier quota (``FreeAiQuota``), remembered by its UTC day.
``saas``: one credit (``CreditService``), remembered by its ledger id. Either way the refund is
exactly-once and never raises, so bookkeeping cannot hide the real outcome of a failed job.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.credit_ledger import CreditReason
from app.repositories.credit_repository import CreditRepository
from app.services.credit_service import CreditService
from app.services.free_ai_quota import FreeAiQuota, uses_free_ai

logger = get_logger(__name__)


@dataclass(frozen=True)
class AiCharge:
    day: date | None = None  # self_hosted: UTC day of the spent free use
    ledger_id: int | None = None  # saas: the credit's ledger row


def charge_reinforcement(db: Session, user_id: int, session_id: int) -> AiCharge | None:
    """Spend what one AI reinforcement costs; ``None`` when it is free (own AI, Ollama, demo)."""
    if get_settings().is_saas:
        # The claim (NONE/FAILED -> PROCESSING) is atomic, so attempts are serial: the key is unique per attempt.
        attempt = CreditRepository(db).count_charges("session", session_id) + 1
        ledger_id = CreditService(db).consume(
            user_id, reason=CreditReason.REINFORCEMENT, reference_type="session", reference_id=session_id,
            idempotency_key=f"reinforcement:{session_id}:{attempt}",
        )
        return AiCharge(ledger_id=ledger_id)
    if uses_free_ai(db, user_id):
        return AiCharge(day=FreeAiQuota(db).consume(user_id))
    return None


def refund_charge(db: Session, user_id: int, charge: AiCharge | None) -> None:
    if charge is None:
        return
    try:
        if charge.ledger_id is not None:
            CreditService(db).refund(charge.ledger_id)
        elif charge.day is not None:
            FreeAiQuota(db).refund(user_id, charge.day)
    except Exception:  # noqa: BLE001 - bookkeeping must never hide the real outcome
        db.rollback()
        logger.warning("Could not refund the AI charge for user %s", user_id)
