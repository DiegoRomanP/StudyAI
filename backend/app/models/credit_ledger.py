"""Append-only credit ledger: every credit movement is one row, never edited."""

from __future__ import annotations

import enum

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class CreditReason(str, enum.Enum):
    SIGNUP_BONUS = "signup_bonus"
    PURCHASE = "purchase"
    PASS_GRANT = "pass_grant"
    PLAN = "plan"
    REINFORCEMENT = "reinforcement"
    REFUND = "refund"
    ADMIN_ADJUSTMENT = "admin_adjustment"
    EXPIRATION = "expiration"


class CreditSource(str, enum.Enum):
    """Which pot the movement touched: bought/gifted credits or the monthly pass."""

    PURCHASED = "purchased"
    PASS = "pass"


class CreditLedger(TimestampMixin, Base):
    __tablename__ = "credit_ledger"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    # native_enum=False: a new reason never needs an ALTER TYPE on Postgres.
    reason: Mapped[CreditReason] = mapped_column(Enum(CreditReason, native_enum=False, length=24))
    source: Mapped[CreditSource] = mapped_column(Enum(CreditSource, native_enum=False, length=16))
    # Soft link ('plan' | 'session' | 'order' + id): the ledger outlives what it points at.
    reference_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    reference_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Spendable total (purchased + valid pass credits) right after this movement.
    balance_after: Mapped[int] = mapped_column(Integer)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True)
