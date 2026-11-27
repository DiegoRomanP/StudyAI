"""Payment gateway Strategy: one interface, one implementation per vendor, chosen by ``PAYMENT_GATEWAY``."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

from app.models.billing import Order, Product


@dataclass(frozen=True)
class CheckoutSession:
    url: str
    gateway_reference: str


@dataclass(frozen=True)
class WebhookNotice:
    event_id: str  # dedupes deliveries in ``payment_events``
    payment_id: str


@dataclass(frozen=True)
class GatewayPayment:
    id: str
    status: Literal["approved", "pending", "rejected", "refunded"]
    amount_cents: int
    currency: str
    order_id: int
    method: str | None


class PaymentGateway(ABC):
    name: str

    @abstractmethod
    def create_checkout(self, order: Order, product: Product) -> CheckoutSession:
        """Create the hosted payment page; raise ``PaymentGatewayError`` on failure."""

    @abstractmethod
    def parse_webhook(
        self, headers: Mapping[str, str], query: Mapping[str, str], body: bytes
    ) -> WebhookNotice | None:
        """Verify a notification. ``None`` = not about a payment (ignored); ``WebhookError`` = not authentic.

        ``headers`` keys are lowercase (Starlette's ``request.headers`` is case-insensitive).
        """

    @abstractmethod
    def fetch_payment(self, payment_id: str) -> GatewayPayment:
        """Ask the gateway's API for the payment's real state (never trust the notification body)."""


def get_payment_gateway() -> PaymentGateway:
    """Factory over the configured gateway (``PAYMENT_GATEWAY``)."""
    from app.core.config import get_settings
    from app.services.billing.fake_gateway import FakeGateway
    from app.services.billing.mercadopago_gateway import MercadoPagoGateway

    s = get_settings()
    if s.PAYMENT_GATEWAY == "mercadopago":
        return MercadoPagoGateway(
            access_token=s.MP_ACCESS_TOKEN, webhook_secret=s.MP_WEBHOOK_SECRET,
            app_url=s.PUBLIC_APP_URL, api_url=s.PUBLIC_API_URL,
        )
    return FakeGateway(app_url=s.PUBLIC_APP_URL)
