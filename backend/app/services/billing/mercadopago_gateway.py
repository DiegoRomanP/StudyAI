"""Mercado Pago Checkout Pro (Yape and cards in Peru).

- Checkout: ``POST /checkout/preferences`` with ``external_reference = order.id``; the learner pays on
  Mercado Pago's page and comes back to ``/pago/resultado``. That redirect never credits anything.
- Webhook: ``x-signature: ts=<ts>,v1=<hex>`` is HMAC-SHA256(``MP_WEBHOOK_SECRET``,
  ``id:<data.id>;request-id:<x-request-id>;ts:<ts>;``) — pairs missing from the notification are left
  out of the manifest, and an alphanumeric ``data.id`` is lowercased (Mercado Pago docs, 2026).
- Then the payment is read back with ``GET /v1/payments/{id}``: its amount, currency and
  ``external_reference`` are the only facts the service acts on.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation

from app.core.exceptions import PaymentGatewayError, WebhookError
from app.core.logging import get_logger
from app.models.billing import Order, Product
from app.services.billing.gateway import CheckoutSession, GatewayPayment, PaymentGateway, WebhookNotice

logger = get_logger(__name__)

API_BASE = "https://api.mercadopago.com"
_shared_client = None  # one pooled client per process (a gateway object is built per request)
_STATUS = {
    "approved": "approved",
    "refunded": "refunded",
    "charged_back": "refunded",
    "rejected": "rejected",
    "cancelled": "rejected",
}


def signature_manifest(data_id: str | None, request_id: str | None, ts: str) -> str:
    parts = []
    if data_id:
        parts.append(f"id:{data_id.lower()};")
    if request_id:
        parts.append(f"request-id:{request_id};")
    parts.append(f"ts:{ts};")
    return "".join(parts)


class MercadoPagoGateway(PaymentGateway):
    name = "mercadopago"

    def __init__(self, *, access_token: str, webhook_secret: str, app_url: str, api_url: str, client=None) -> None:
        self.access_token = access_token
        self.webhook_secret = webhook_secret
        self.app_url = app_url.rstrip("/")
        self.api_url = api_url.rstrip("/")
        self._client = client  # injected in tests; otherwise built lazily

    def _http(self):
        global _shared_client
        if self._client is None:
            if _shared_client is None:
                import httpx  # lazy: only the real gateway needs it

                _shared_client = httpx.Client(base_url=API_BASE, timeout=httpx.Timeout(10.0, connect=5.0))
            self._client = _shared_client
        return self._client

    def _request(self, method: str, path: str, **kwargs) -> dict:
        if not self.access_token:
            logger.error("Mercado Pago: MP_ACCESS_TOKEN is not set")
            raise PaymentGatewayError
        import httpx

        headers = {"Authorization": f"Bearer {self.access_token}", **kwargs.pop("headers", {})}
        try:
            response = self._http().request(method, path, headers=headers, **kwargs)
        except httpx.HTTPError as exc:
            logger.warning("Mercado Pago %s %s failed: %s", method, path.split("/")[1], type(exc).__name__)
            raise PaymentGatewayError from None
        if response.status_code >= 400:
            logger.warning("Mercado Pago %s %s answered %s", method, path.split("/")[1], response.status_code)
            raise PaymentGatewayError
        try:
            data = response.json()
        except ValueError:
            raise PaymentGatewayError from None
        if not isinstance(data, dict):
            raise PaymentGatewayError
        return data

    def create_checkout(self, order: Order, product: Product) -> CheckoutSession:
        result_url = f"{self.app_url}/pago/resultado?order={order.id}"
        body = {
            "items": [{
                "id": product.code, "title": product.name, "quantity": 1,
                "unit_price": float(Decimal(order.amount_cents) / 100), "currency_id": order.currency,
            }],
            "external_reference": str(order.id),
            "back_urls": {"success": result_url, "failure": result_url, "pending": result_url},
            "auto_return": "approved",
            "notification_url": f"{self.api_url}/billing/webhooks/mercadopago",
        }
        data = self._request(
            "POST", "/checkout/preferences", json=body, headers={"X-Idempotency-Key": f"order-{order.id}"}
        )
        url, pref_id = data.get("init_point"), data.get("id")
        if not isinstance(url, str) or not url.startswith("https://") or not pref_id:
            raise PaymentGatewayError
        return CheckoutSession(url=url, gateway_reference=str(pref_id))

    def parse_webhook(
        self, headers: Mapping[str, str], query: Mapping[str, str], body: bytes
    ) -> WebhookNotice | None:
        if not self.webhook_secret:  # fail closed: without the secret nothing is authentic
            logger.error("Mercado Pago webhook received but MP_WEBHOOK_SECRET is not set")
            raise WebhookError
        fields = dict(
            part.strip().split("=", 1) for part in headers.get("x-signature", "").split(",") if "=" in part
        )
        ts, received = fields.get("ts"), fields.get("v1")
        if not ts or not received:
            raise WebhookError
        data_id, request_id = query.get("data.id"), headers.get("x-request-id")
        expected = hmac.new(
            self.webhook_secret.encode(), signature_manifest(data_id, request_id, ts).encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected.encode(), received.lower().encode()):  # bytes: non-ASCII can't raise
            raise WebhookError

        topic = query.get("type") or query.get("topic")
        if topic is None:
            try:
                topic = json.loads(body or b"{}").get("type")
            except (ValueError, AttributeError):
                topic = None
        if topic != "payment":
            return None
        if not data_id or not data_id.isdigit():
            raise WebhookError
        return WebhookNotice(event_id=f"mp:{request_id or f'{data_id}:{ts}'}"[:128], payment_id=data_id)

    def fetch_payment(self, payment_id: str) -> GatewayPayment:
        if not payment_id.isdigit():  # it goes into the URL path
            raise WebhookError
        data = self._request("GET", f"/v1/payments/{payment_id}")
        try:
            amount_cents = int((Decimal(str(data["transaction_amount"])) * 100).to_integral_value())
            order_id = int(data["external_reference"])
        except (KeyError, TypeError, ValueError, InvalidOperation):
            logger.warning("Mercado Pago payment %s has no usable amount or external_reference", payment_id)
            raise PaymentGatewayError from None
        method = data.get("payment_method_id")
        return GatewayPayment(
            id=str(payment_id),
            status=_STATUS.get(data.get("status"), "pending"),  # type: ignore[arg-type]
            amount_cents=amount_cents,
            currency=str(data.get("currency_id") or ""),
            order_id=order_id,
            method=str(method)[:32] if method else None,
        )
