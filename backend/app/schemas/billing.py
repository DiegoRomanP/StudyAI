"""Billing DTOs (contract: docs/api_contract.yaml, /billing/*)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.billing import OrderStatus, ProductKind


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    kind: ProductKind
    credits: int
    pass_days: int | None
    price_cents: int
    currency: str


class CheckoutRequest(BaseModel):
    # Any other field (an "amount" sent by the client) is ignored: the price comes from products.
    product_code: str = Field(min_length=1, max_length=32)
    idempotency_key: str = Field(min_length=1, max_length=255)


class CheckoutResponse(BaseModel):
    order_id: int
    checkout_url: str


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_code: str
    status: OrderStatus
    amount_cents: int
    currency: str
    created_at: datetime
    paid_at: datetime | None
