"""Billing with the fake gateway: amounts from products, idempotent checkout, credit exactly once."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

import main
from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.billing import Order, PaymentEvent
from app.models.credit_ledger import CreditLedger
from app.models.user import User
from app.services.billing.fake_gateway import FakeGateway
from app.services.billing.gateway import GatewayPayment

USER_ID = 1


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as db:
        db.execute(delete(PaymentEvent))
        db.execute(delete(Order))
        db.execute(delete(CreditLedger))
        user = db.get(User, USER_ID)
        user.credit_balance, user.pass_credits, user.pass_expires_at = 0, 0, None
        db.commit()
    yield
    main.app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def saas(monkeypatch):
    monkeypatch.setattr(get_settings(), "DEPLOYMENT_MODE", "saas")


def _checkout(client, code="pack_10", key=None, **extra):
    return client.post(
        "/billing/checkout", json={"product_code": code, "idempotency_key": key or uuid.uuid4().hex, **extra}
    )


def _balance():
    with SessionLocal() as db:
        u = db.get(User, USER_ID)
        return u.credit_balance, u.pass_credits, u.pass_expires_at


def _ledger_rows():
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(CreditLedger))


def test_products_are_seeded(client, saas):
    products = {p["code"]: p for p in client.get("/billing/products").json()}
    assert products["pack_10"] == {
        "code": "pack_10", "name": "Paquete de 10 créditos", "kind": "pack", "credits": 10,
        "pass_days": None, "price_cents": 490, "currency": "PEN",
    }
    assert products["pass_30d"]["kind"] == "pass" and products["pass_30d"]["pass_days"] == 30


def test_checkout_amount_comes_from_product(client, saas):
    response = _checkout(client, amount_cents=1, price_cents=1)
    assert response.status_code == 200
    body = response.json()
    assert body["checkout_url"].endswith(f"/pago/resultado?order={body['order_id']}")
    order = client.get(f"/billing/orders/{body['order_id']}").json()
    assert (order["amount_cents"], order["currency"], order["status"], order["paid_at"]) == (490, "PEN", "pending", None)


def test_same_checkout_key_returns_same_order(client, saas):
    first, second = _checkout(client, key="k-same").json(), _checkout(client, key="k-same").json()
    assert first == second
    assert len(client.get("/billing/orders").json()) == 1


def test_same_key_for_another_product_is_409(client, saas):
    _checkout(client, key="k-reuse")
    response = _checkout(client, "pack_60", key="k-reuse")
    assert response.status_code == 409 and response.json()["code"] == "IDEMPOTENCY_CONFLICT"


def test_unknown_product_is_404(client, saas):
    assert _checkout(client, "pack_999").status_code == 404


def test_fake_complete_credits_once(client, saas):
    order_id = _checkout(client).json()["order_id"]
    first = client.post(f"/billing/fake/complete/{order_id}")
    second = client.post(f"/billing/fake/complete/{order_id}")
    assert first.status_code == second.status_code == 200
    assert first.json()["status"] == "paid" and first.json()["paid_at"] is not None
    assert _balance()[0] == 10
    assert _ledger_rows() == 1
    assert client.get("/account/credits").json()["tier"] == "credits"


def test_duplicate_webhook_event_credits_once(client, saas):
    order_id = _checkout(client).json()["order_id"]
    body = json.dumps({"event_id": "evt-1", "order_id": order_id, "amount_cents": 490})
    for _ in range(2):
        assert client.post("/billing/webhooks/fake", content=body).json() == {"received": True}
    assert _balance()[0] == 10
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(PaymentEvent)) == 1


def test_distinct_events_for_the_same_order_still_credit_once(client, saas):
    order_id = _checkout(client).json()["order_id"]
    for event in ("evt-a", "evt-b"):
        client.post("/billing/webhooks/fake", content=json.dumps({"event_id": event, "order_id": order_id, "amount_cents": 490}))
    assert _balance()[0] == 10 and _ledger_rows() == 1


def test_amount_mismatch_rejected(client, saas):
    order_id = _checkout(client).json()["order_id"]
    body = json.dumps({"event_id": "evt-cheap", "order_id": order_id, "amount_cents": 100})
    assert client.post("/billing/webhooks/fake", content=body).status_code == 200
    assert client.get(f"/billing/orders/{order_id}").json()["status"] == "pending"
    assert _balance()[0] == 0 and _ledger_rows() == 0


def test_currency_mismatch_rejected(client, saas, monkeypatch):
    order_id = _checkout(client).json()["order_id"]
    monkeypatch.setattr(FakeGateway, "fetch_payment", lambda self, pid: GatewayPayment(
        id="x1", status="approved", amount_cents=490, currency="USD", order_id=order_id, method=None,
    ))
    client.post("/billing/webhooks/fake", content=json.dumps({"event_id": "e", "order_id": order_id, "amount_cents": 490}))
    assert client.get(f"/billing/orders/{order_id}").json()["status"] == "pending"
    assert _ledger_rows() == 0


def test_unreadable_fake_webhook_is_400(client, saas):
    response = client.post("/billing/webhooks/fake", content=b"not json")
    assert response.status_code == 400 and response.json()["code"] == "WEBHOOK_INVALID"


def test_webhook_for_another_gateway_is_404(client, saas):
    assert client.post("/billing/webhooks/mercadopago", content=b"{}").status_code == 404


def test_pass_purchase_sets_expiry_and_credits(client, saas):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with SessionLocal() as db:  # an active pass with 5 days left and leftover credits
        user = db.get(User, USER_ID)
        user.pass_credits, user.pass_expires_at = 3, now + timedelta(days=5)
        db.commit()
    order_id = _checkout(client, "pass_30d").json()["order_id"]
    client.post(f"/billing/fake/complete/{order_id}")
    _, pass_credits, expires = _balance()
    assert pass_credits == 150  # reset, not 153
    assert timedelta(days=34, hours=23) < expires - now < timedelta(days=35, hours=1)
    assert client.get("/account/credits").json()["tier"] == "pass"


def test_fake_endpoint_absent_in_production(client, saas, monkeypatch):
    order_id = _checkout(client).json()["order_id"]
    monkeypatch.setattr(get_settings(), "APP_ENV", "production")
    assert client.post(f"/billing/fake/complete/{order_id}").status_code == 404
    body = json.dumps({"event_id": "evt-prod", "order_id": order_id, "amount_cents": 490})
    assert client.post("/billing/webhooks/fake", content=body).status_code == 404
    assert _ledger_rows() == 0


def test_fake_endpoint_absent_with_real_gateway(client, saas, monkeypatch):
    order_id = _checkout(client).json()["order_id"]
    monkeypatch.setattr(get_settings(), "PAYMENT_GATEWAY", "mercadopago")
    assert client.post(f"/billing/fake/complete/{order_id}").status_code == 404


def test_orders_isolated_between_users(client, saas):
    order_id = _checkout(client).json()["order_id"]
    with SessionLocal() as db:
        other = User(email=f"{uuid.uuid4().hex[:10]}@example.com")
        db.add(other)
        db.commit()
        db.refresh(other)
        db.expunge(other)
    main.app.dependency_overrides[get_current_user] = lambda: other
    assert client.get("/billing/orders").json() == []
    assert client.get(f"/billing/orders/{order_id}").status_code == 404
    assert client.post(f"/billing/fake/complete/{order_id}").status_code == 404
    assert client.get(f"/billing/orders/{order_id}").status_code == 404
    main.app.dependency_overrides.pop(get_current_user)
    assert client.get(f"/billing/orders/{order_id}").json()["status"] == "pending"


def test_billing_is_404_in_self_hosted(client):
    assert get_settings().DEPLOYMENT_MODE == "self_hosted"
    assert client.get("/billing/products").status_code == 404
    assert _checkout(client).status_code == 404
    assert client.get("/billing/orders").status_code == 404
    assert client.post("/billing/webhooks/fake", content=b"{}").status_code == 404
    assert client.post("/billing/fake/complete/1").status_code == 404
