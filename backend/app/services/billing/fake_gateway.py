"""Development/test gateway: no money moves. Paying = ``POST /billing/fake/complete/{order_id}``.

Its webhook takes ``{"event_id", "order_id", "amount_cents"}`` unsigned, so the route only exists
outside production (same guard as the fake-complete endpoint).
"""

from __future__ import annotations

import json
from collections.abc import Mapping

from app.core.exceptions import WebhookError
from app.models.billing import Order, Product
from app.services.billing.gateway import CheckoutSession, GatewayPayment, PaymentGateway, WebhookNotice


class FakeGateway(PaymentGateway):
    name = "fake"

    def __init__(self, app_url: str) -> None:
        self.app_url = app_url.rstrip("/")

    def create_checkout(self, order: Order, product: Product) -> CheckoutSession:
        return CheckoutSession(url=f"{self.app_url}/pago/resultado?order={order.id}", gateway_reference=f"fake-{order.id}")

    def parse_webhook(
        self, headers: Mapping[str, str], query: Mapping[str, str], body: bytes
    ) -> WebhookNotice | None:
        try:
            data = json.loads(body)
            return WebhookNotice(
                event_id=str(data["event_id"]), payment_id=f"{int(data['order_id'])}:{int(data['amount_cents'])}"
            )
        except (ValueError, KeyError, TypeError):
            raise WebhookError from None

    def fetch_payment(self, payment_id: str) -> GatewayPayment:
        # The fake has no API to ask, so the payment id carries "order_id:amount_cents".
        order_id, amount = (int(part) for part in payment_id.split(":"))
        return GatewayPayment(
            id=f"fake-{order_id}", status="approved", amount_cents=amount, currency="PEN",
            order_id=order_id, method="fake",
        )
