"""Products, orders and payment events persistence."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select, update

from app.models.billing import Order, OrderStatus, PaymentEvent, Product
from app.repositories.base import BaseRepository


class BillingRepository(BaseRepository[Order]):
    model = Order

    def active_products(self) -> list[Product]:
        stmt = select(Product).where(Product.active.is_(True)).order_by(Product.price_cents)
        return list(self.db.scalars(stmt).all())

    def active_product(self, code: str) -> Product | None:
        return self.db.scalar(select(Product).where(Product.code == code, Product.active.is_(True)))

    def order_by_key(self, idempotency_key: str) -> Order | None:
        return self.db.scalar(select(Order).where(Order.idempotency_key == idempotency_key))

    def order_for_user(self, order_id: int, user_id: int) -> Order | None:
        return self.db.scalar(select(Order).where(Order.id == order_id, Order.user_id == user_id))

    def orders_for_user(self, user_id: int) -> list[Order]:
        stmt = select(Order).where(Order.user_id == user_id).order_by(Order.id.desc())
        return list(self.db.scalars(stmt).all())

    def claim_paid(self, order_id: int, *, payment_id: str, method: str | None, paid_at: datetime) -> bool:
        """``pending → paid`` by conditional UPDATE, not committed: only one caller ever wins."""
        result = self.db.execute(
            update(Order)
            .where(Order.id == order_id, Order.status == OrderStatus.PENDING)
            .values(status=OrderStatus.PAID, gateway_payment_id=payment_id, payment_method=method, paid_at=paid_at)
            .execution_options(synchronize_session=False)
        )
        return result.rowcount == 1

    def event_by_id(self, event_id: str) -> PaymentEvent | None:
        return self.db.scalar(select(PaymentEvent).where(PaymentEvent.event_id == event_id))
