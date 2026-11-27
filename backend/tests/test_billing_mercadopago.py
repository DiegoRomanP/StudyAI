"""Mercado Pago gateway with respx: no real network, ever."""

from __future__ import annotations

import hashlib
import hmac
import uuid

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from sqlalchemy import delete

import main
from app.core.config import get_settings
from app.core.exceptions import PaymentGatewayError, WebhookError
from app.db.session import SessionLocal
from app.models.billing import Order, PaymentEvent
from app.models.credit_ledger import CreditLedger
from app.models.user import User
from app.services.billing.mercadopago_gateway import API_BASE, MercadoPagoGateway, signature_manifest

SECRET = "test-webhook-secret"
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
        db.get(User, USER_ID).credit_balance = 0
        db.commit()


@pytest.fixture
def mp(monkeypatch):
    s = get_settings()
    for key, value in {
        "DEPLOYMENT_MODE": "saas", "PAYMENT_GATEWAY": "mercadopago", "MP_ACCESS_TOKEN": "TEST-token",
        "MP_WEBHOOK_SECRET": SECRET, "PUBLIC_APP_URL": "https://studyinflow.app",
        "PUBLIC_API_URL": "https://api.studyinflow.app",
    }.items():
        monkeypatch.setattr(s, key, value)
    with respx.mock(base_url=API_BASE, assert_all_called=False) as router:
        yield router


def _sign(data_id: str, request_id: str = "req-1", ts: str = "1742505638683", secret: str = SECRET) -> dict:
    v1 = hmac.new(secret.encode(), signature_manifest(data_id, request_id, ts).encode(), hashlib.sha256).hexdigest()
    return {"x-signature": f"ts={ts},v1={v1}", "x-request-id": request_id}


def _checkout(client, mp, code="pack_10") -> int:
    mp.post("/checkout/preferences").mock(return_value=httpx.Response(
        201, json={"id": "pref-1", "init_point": "https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=pref-1"}
    ))
    response = client.post("/billing/checkout", json={"product_code": code, "idempotency_key": uuid.uuid4().hex})
    assert response.status_code == 200, response.text
    return response.json()["order_id"]


def _payment(mp, payment_id: str, order_id: int, *, amount=4.9, currency="PEN", status="approved"):
    return mp.get(f"/v1/payments/{payment_id}").mock(return_value=httpx.Response(200, json={
        "id": int(payment_id), "status": status, "transaction_amount": amount, "currency_id": currency,
        "external_reference": str(order_id), "payment_method_id": "yape",
    }))


def _notify(client, payment_id: str, headers: dict):
    return client.post(
        f"/billing/webhooks/mercadopago?data.id={payment_id}&type=payment",
        json={"type": "payment", "data": {"id": payment_id}}, headers=headers,
    )


def test_checkout_creates_preference_from_server_prices(client, mp):
    route = mp.post("/checkout/preferences").mock(return_value=httpx.Response(
        201, json={"id": "pref-9", "init_point": "https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=pref-9"}
    ))
    body = client.post("/billing/checkout", json={"product_code": "pack_60", "idempotency_key": "mp-k1", "amount": 1}).json()
    assert body["checkout_url"].startswith("https://www.mercadopago.com.pe/")
    sent = route.calls.last.request
    payload = __import__("json").loads(sent.content)
    assert sent.headers["authorization"] == "Bearer TEST-token"
    assert payload["items"][0]["unit_price"] == 19.9 and payload["items"][0]["currency_id"] == "PEN"
    assert payload["external_reference"] == str(body["order_id"])
    assert payload["back_urls"]["success"] == f"https://studyinflow.app/pago/resultado?order={body['order_id']}"
    assert payload["auto_return"] == "approved"
    assert payload["notification_url"] == "https://api.studyinflow.app/billing/webhooks/mercadopago"
    # a retry with the same key reuses the stored page: no second preference
    again = client.post("/billing/checkout", json={"product_code": "pack_60", "idempotency_key": "mp-k1"}).json()
    assert again == body and route.call_count == 1


def test_gateway_failure_is_502_and_order_stays_pending(client, mp):
    mp.post("/checkout/preferences").mock(return_value=httpx.Response(500, json={"message": "boom"}))
    response = client.post("/billing/checkout", json={"product_code": "pack_10", "idempotency_key": "mp-fail"})
    assert response.status_code == 502 and response.json()["code"] == "PAYMENT_GATEWAY_ERROR"
    assert "boom" not in response.text
    assert [o["status"] for o in client.get("/billing/orders").json()] == ["pending"]


def test_signed_webhook_credits_once(client, mp):
    order_id = _checkout(client, mp)
    payment = _payment(mp, "123456", order_id)
    assert _notify(client, "123456", _sign("123456")).status_code == 200
    assert _notify(client, "123456", _sign("123456")).status_code == 200  # same delivery again
    assert _notify(client, "123456", _sign("123456", request_id="req-2")).status_code == 200  # a retry
    order = client.get(f"/billing/orders/{order_id}").json()
    assert order["status"] == "paid"
    assert client.get("/account/credits").json()["purchased"] == 10
    assert payment.call_count == 2  # the duplicate delivery never even reached the API


@pytest.mark.parametrize("headers", [
    {},
    {"x-signature": "ts=1742505638683", "x-request-id": "req-1"},
    {"x-signature": "garbage", "x-request-id": "req-1"},
    _sign("123456", secret="wrong-secret"),
    _sign("999999"),  # signed for another payment id
    {**_sign("123456"), "x-request-id": "req-other"},
])
def test_invalid_signature_is_400(client, mp, headers):
    order_id = _checkout(client, mp)
    payment = _payment(mp, "123456", order_id)
    response = _notify(client, "123456", headers)
    assert response.status_code == 400 and response.json()["code"] == "WEBHOOK_INVALID"
    assert payment.call_count == 0
    assert client.get(f"/billing/orders/{order_id}").json()["status"] == "pending"


def test_missing_secret_fails_closed(client, mp, monkeypatch):
    monkeypatch.setattr(get_settings(), "MP_WEBHOOK_SECRET", "")
    assert _notify(client, "123456", _sign("123456")).status_code == 400


def test_amount_mismatch_does_not_credit(client, mp):
    order_id = _checkout(client, mp)
    _payment(mp, "555", order_id, amount=0.1)
    assert _notify(client, "555", _sign("555")).status_code == 200
    assert client.get(f"/billing/orders/{order_id}").json()["status"] == "pending"
    assert client.get("/account/credits").json()["purchased"] == 0


def test_pending_payment_does_not_credit(client, mp):
    order_id = _checkout(client, mp)
    _payment(mp, "556", order_id, status="in_process")
    _notify(client, "556", _sign("556"))
    assert client.get(f"/billing/orders/{order_id}").json()["status"] == "pending"


def test_non_payment_topic_is_ignored(client, mp):
    headers = _sign("777")
    response = client.post("/billing/webhooks/mercadopago?data.id=777&type=merchant_order", headers=headers)
    assert response.status_code == 200


def test_api_failure_lets_the_gateway_retry(client, mp):
    order_id = _checkout(client, mp)
    route = mp.get("/v1/payments/888").mock(return_value=httpx.Response(503))
    assert _notify(client, "888", _sign("888")).status_code == 502
    route.mock(return_value=httpx.Response(200, json={
        "id": 888, "status": "approved", "transaction_amount": 4.9, "currency_id": "PEN",
        "external_reference": str(order_id),
    }))
    assert _notify(client, "888", _sign("888")).status_code == 200  # same request-id, now processed
    assert client.get(f"/billing/orders/{order_id}").json()["status"] == "paid"


def test_fetch_payment_maps_soles_to_cents():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={
        "id": 1, "status": "approved", "transaction_amount": 34.9, "currency_id": "PEN",
        "external_reference": "42", "payment_method_id": "visa",
    }))
    gw = MercadoPagoGateway(
        access_token="t", webhook_secret=SECRET, app_url="a", api_url="b",
        client=httpx.Client(base_url=API_BASE, transport=transport),
    )
    payment = gw.fetch_payment("1")
    assert (payment.amount_cents, payment.order_id, payment.status, payment.method) == (3490, 42, "approved", "visa")
    with pytest.raises(WebhookError):
        gw.fetch_payment("1/../../users")


def test_payment_without_reference_is_a_gateway_error():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"id": 1, "status": "approved"}))
    gw = MercadoPagoGateway(
        access_token="t", webhook_secret=SECRET, app_url="a", api_url="b",
        client=httpx.Client(base_url=API_BASE, transport=transport),
    )
    with pytest.raises(PaymentGatewayError):
        gw.fetch_payment("1")


def test_manifest_omits_missing_parts():
    assert signature_manifest("ABC", "r", "1") == "id:abc;request-id:r;ts:1;"
    assert signature_manifest(None, None, "1") == "ts:1;"
