"""Account DTOs: credit balance and ledger history."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.credit_ledger import CreditReason, CreditSource


class CreditBalanceResponse(BaseModel):
    purchased: int
    pass_credits: int
    pass_expires_at: datetime | None
    total: int
    tier: Literal["free", "credits", "pass"]
    max_documents: int | None
    max_active_goals: int | None
    documents_used: int
    active_goals_used: int


class CreditLedgerEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    delta: int
    reason: CreditReason
    source: CreditSource
    reference_type: str | None
    reference_id: int | None
    balance_after: int
    created_at: datetime
