"""Credit ledger: atomic, idempotent consume; refund once; welcome gift."""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.disposable_domains import normalize_email
from app.core.exceptions import InsufficientCreditsError
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models.credit_ledger import CreditLedger, CreditReason, CreditSource
from app.models.user import User
from app.services.credit_service import CreditService
from app.services.user_service import on_user_created


@pytest.fixture(scope="module", autouse=True)
def _schema():
    init_db()


def _naive_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def make_user(*, purchased=0, pass_credits=0, pass_expires=None, email=None) -> int:
    with SessionLocal() as db:
        user = User(
            email=email or f"{uuid.uuid4().hex[:10]}@example.com",
            credit_balance=purchased, pass_credits=pass_credits, pass_expires_at=pass_expires,
        )
        db.add(user)
        db.commit()
        return user.id


def spend(db, user_id, key=None):
    return CreditService(db).consume(
        user_id, reason=CreditReason.PLAN, reference_type="plan", reference_id=1,
        idempotency_key=key or uuid.uuid4().hex,
    )


def cols(user_id):
    with SessionLocal() as db:
        u = db.get(User, user_id)
        return u.credit_balance, u.pass_credits


def test_consume_prefers_valid_pass():
    uid = make_user(purchased=2, pass_credits=2, pass_expires=_naive_now() + timedelta(days=5))
    with SessionLocal() as db:
        charge = spend(db, uid)
        assert db.get(CreditLedger, charge).source == CreditSource.PASS
    assert cols(uid) == (2, 1)


def test_expired_pass_falls_back_to_purchased():
    uid = make_user(purchased=2, pass_credits=2, pass_expires=_naive_now() - timedelta(days=1))
    with SessionLocal() as db:
        charge = spend(db, uid)
        assert db.get(CreditLedger, charge).source == CreditSource.PURCHASED
        assert CreditService(db).balance(uid).pass_credits == 0
    assert cols(uid) == (1, 2)


def test_consume_without_balance_raises_402_and_spends_nothing():
    uid = make_user()
    with SessionLocal() as db, pytest.raises(InsufficientCreditsError):
        spend(db, uid)
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).where(CreditLedger.user_id == uid)) == 0
    assert cols(uid) == (0, 0)


def test_same_idempotency_key_charges_once():
    uid = make_user(purchased=3)
    with SessionLocal() as db:
        first = spend(db, uid, "k1")
        assert spend(db, uid, "k1") == first
    assert cols(uid) == (2, 0)


def test_refund_exactly_once():
    uid = make_user(purchased=1)
    with SessionLocal() as db:
        charge = spend(db, uid)
        service = CreditService(db)
        service.refund(charge)
        service.refund(charge)
        refunds = db.scalar(
            select(func.count()).where(CreditLedger.user_id == uid, CreditLedger.reason == CreditReason.REFUND)
        )
    assert refunds == 1
    assert cols(uid) == (1, 0)


def test_concurrent_consume_last_credit():
    """The double click on the last credit: one wins, the other gets 402, never -1."""
    uid = make_user(purchased=1)

    def attempt(_):
        with SessionLocal() as db:
            try:
                spend(db, uid)
                return "ok"
            except InsufficientCreditsError:
                return "402"

    with ThreadPoolExecutor(2) as pool:
        results = sorted(pool.map(attempt, range(2)))
    assert results == ["402", "ok"]
    assert cols(uid) == (0, 0)


def test_signup_bonus_once_and_not_for_disposable(monkeypatch):
    monkeypatch.setattr(get_settings(), "DEPLOYMENT_MODE", "saas")
    good = make_user(email=f"{uuid.uuid4().hex[:6]}.x+a@gmail.com")
    spam = make_user(email=f"{uuid.uuid4().hex[:6]}@mailinator.com")
    with SessionLocal() as db:
        for _ in range(2):  # the hook running twice still grants once
            on_user_created(db, db.get(User, good))
        on_user_created(db, db.get(User, spam))
        alias = User(email=normalize_email(db.get(User, good).email).replace("@gmail.com", "+2@gmail.com"))
        db.add(alias)
        db.commit()
        on_user_created(db, alias)  # same inbox, different account: no second gift
    assert cols(good) == (3, 0)
    assert cols(spam) == (0, 0)
    assert cols(alias.id) == (0, 0)


def test_signup_bonus_is_off_in_self_hosted():
    uid = make_user()
    with SessionLocal() as db:
        on_user_created(db, db.get(User, uid))
    assert cols(uid) == (0, 0)


def test_balance_after_matches_user_columns():
    uid = make_user(purchased=4, pass_credits=3, pass_expires=_naive_now() + timedelta(days=2))
    with SessionLocal() as db:
        charge = spend(db, uid)
        entry = db.get(CreditLedger, charge)
        balance = CreditService(db).balance(uid)
    assert entry.balance_after == balance.total == sum(cols(uid)) == 6
    assert balance.tier == "pass"
