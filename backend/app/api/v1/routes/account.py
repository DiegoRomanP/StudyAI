"""Account endpoints: credit balance and history."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.account import CreditBalanceResponse, CreditLedgerEntryResponse
from app.services.credit_service import CreditService

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/credits", response_model=CreditBalanceResponse)
def get_credits(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> CreditBalanceResponse:
    balance = CreditService(db).balance(user.id)
    return CreditBalanceResponse(**vars(balance), total=balance.total)


@router.get("/credits/history", response_model=list[CreditLedgerEntryResponse])
def get_credit_history(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CreditLedgerEntryResponse]:
    return [CreditLedgerEntryResponse.model_validate(e) for e in CreditService(db).history(user.id, limit)]
