"""Purchases (saas): products for sale, the learner's orders and the gateway notifications received.

Amounts are integer céntimos de sol; the price of an order always comes from ``products``.
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, _utcnow


class ProductKind(str, enum.Enum):
    PACK = "pack"  # credits that never expire
    PASS = "pass"  # credits that reset with an expiry date


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


class PaymentGatewayName(str, enum.Enum):
    MERCADOPAGO = "mercadopago"
    CULQI = "culqi"
    FAKE = "fake"


class Product(TimestampMixin, Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    # native_enum=False everywhere here: a new value never needs an ALTER TYPE on Postgres.
    kind: Mapped[ProductKind] = mapped_column(Enum(ProductKind, native_enum=False, length=8))
    price_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="PEN")
    credits: Mapped[int] = mapped_column(Integer)
    pass_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Order(TimestampMixin, Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, native_enum=False, length=16), default=OrderStatus.PENDING
    )
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    gateway: Mapped[PaymentGatewayName] = mapped_column(Enum(PaymentGatewayName, native_enum=False, length=16))
    gateway_payment_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True)
    # Kept so a retried checkout returns the same payment page instead of creating another.
    checkout_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    receipt_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(nullable=True)

    product: Mapped[Product] = relationship(lazy="joined")

    @property
    def product_code(self) -> str:
        return self.product.code


class PaymentEvent(Base):
    """Audit + dedupe of webhook deliveries: one row per ``event_id``."""

    __tablename__ = "payment_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    gateway: Mapped[PaymentGatewayName] = mapped_column(Enum(PaymentGatewayName, native_enum=False, length=16))
    event_id: Mapped[str] = mapped_column(String(128), unique=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    received_at: Mapped[datetime] = mapped_column(default=_utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    error: Mapped[str | None] = mapped_column(String(255), nullable=True)
