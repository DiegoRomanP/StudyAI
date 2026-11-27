"""Orders and crediting. Money rules (spec §7.5):

- The amount always comes from ``products``, never from the client.
- Only a verified webhook (or the backend asking the gateway) marks an order paid; never the redirect.
- Exactly once: ``payment_events.event_id`` is unique, the order moves ``pending → paid`` by conditional
  UPDATE, and the credit uses the ledger key ``order:{id}:credit``.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.models.billing import Order, PaymentEvent, PaymentGatewayName, Product, ProductKind
from app.models.credit_ledger import CreditReason, CreditSource
from app.repositories.billing_repository import BillingRepository
from app.services.billing.gateway import GatewayPayment, PaymentGateway
from app.services.credit_service import CreditService

logger = get_logger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class BillingService:
    def __init__(self, db: Session, gateway: PaymentGateway) -> None:
        self.db = db
        self.gateway = gateway
        self.repo = BillingRepository(db)

    def list_products(self) -> list[Product]:
        return self.repo.active_products()

    def list_orders(self, user_id: int) -> list[Order]:
        return self.repo.orders_for_user(user_id)

    def get_order(self, user_id: int, order_id: int) -> Order:
        order = self.repo.order_for_user(order_id, user_id)
        if order is None:  # someone else's order looks exactly like a missing one
            raise NotFoundError("Orden no encontrada.")
        return order

    def checkout(self, user_id: int, product_code: str, idempotency_key: str) -> tuple[Order, str]:
        product = self.repo.active_product(product_code)
        if product is None:
            raise NotFoundError("Producto no encontrado.")
        order = self.repo.order_by_key(idempotency_key)
        if order is None:
            order = Order(
                user_id=user_id, product_id=product.id, amount_cents=product.price_cents,
                currency=product.currency, gateway=PaymentGatewayName(self.gateway.name),
                idempotency_key=idempotency_key,
            )
            self.db.add(order)
            try:
                self.db.commit()
            except IntegrityError:  # a concurrent retry with the same key inserted first
                self.db.rollback()
                order = self.repo.order_by_key(idempotency_key)
                if order is None:
                    raise
        if order.user_id != user_id or order.product_id != product.id:
            raise ConflictError("Esa clave de compra ya se usó para otra compra.", "IDEMPOTENCY_CONFLICT")
        if order.checkout_url is None:
            # A gateway failure raises here and leaves the order pending; the same key retries it.
            order.checkout_url = self.gateway.create_checkout(order, product).url
            self.db.commit()
        return order, order.checkout_url

    def handle_webhook(self, headers: Mapping[str, str], query: Mapping[str, str], body: bytes) -> None:
        notice = self.gateway.parse_webhook(headers, query, body)
        if notice is None:
            return
        event = self.repo.event_by_id(notice.event_id)
        if event is None:
            event = PaymentEvent(
                gateway=PaymentGatewayName(self.gateway.name), event_id=notice.event_id,
                payload_hash=hashlib.sha256(body).hexdigest(),
            )
            self.db.add(event)
            try:
                self.db.commit()
            except IntegrityError:  # the same delivery is being handled concurrently
                self.db.rollback()
                return
        elif event.processed_at is not None:
            return  # duplicate delivery
        event_pk = event.id
        try:
            self.apply_payment(self.gateway.fetch_payment(notice.payment_id))
        except Exception as exc:  # keep the trail, let the gateway retry (non-2xx)
            self.db.rollback()
            self._mark_event(event_pk, error=type(exc).__name__)
            raise
        self._mark_event(event_pk, error=None)

    def _mark_event(self, event_pk: int, *, error: str | None) -> None:
        event = self.db.get(PaymentEvent, event_pk)
        event.error = error
        event.processed_at = None if error else _now()
        self.db.commit()

    def fake_complete(self, user_id: int, order_id: int) -> Order:
        """D10: the dev "I paid" button, through the same ``apply_payment`` as the webhook."""
        order = self.get_order(user_id, order_id)
        self.apply_payment(GatewayPayment(
            id=f"fake-{order.id}", status="approved", amount_cents=order.amount_cents,
            currency=order.currency, order_id=order.id, method="fake",
        ))
        self.db.refresh(order)
        return order

    def apply_payment(self, payment: GatewayPayment) -> None:
        """Mark the order paid and credit it, once. Anything that does not match exactly is ignored."""
        order = self.db.get(Order, payment.order_id)
        if order is None:
            logger.warning("Payment %s references unknown order %s", payment.id, payment.order_id)
            return
        if payment.status != "approved":
            # shortcut: rejected/refunded payments leave the order pending (the learner can retry the
            # same checkout); refunds are manual for the beta (spec §7.8).
            return
        if payment.amount_cents != order.amount_cents or payment.currency != order.currency:
            logger.warning(
                "Payment %s for order %s does not match (amount/currency); not credited", payment.id, order.id
            )
            return
        if not self.repo.claim_paid(order.id, payment_id=payment.id, method=payment.method, paid_at=_now()):
            self.db.rollback()
            return  # already paid (or no longer pending)
        product = order.product
        credits = CreditService(self.db)
        key = f"order:{order.id}:credit"
        # The claim above is still uncommitted: the credit commits it in the same transaction.
        if product.kind is ProductKind.PASS:
            credits.grant_pass(
                order.user_id, credits=product.credits, days=product.pass_days or 30, idempotency_key=key,
                reference_type="order", reference_id=order.id,
            )
        else:
            credits.grant(
                order.user_id, delta=product.credits, reason=CreditReason.PURCHASE,
                source=CreditSource.PURCHASED, idempotency_key=key, reference_type="order",
                reference_id=order.id,
            )
        self.db.commit()
        logger.info("Order %s paid and credited", order.id)
