"""Billing endpoints (saas only): products, checkout, gateway webhook and the learner's orders."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user, require_saas
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.db.session import get_db
from app.models.user import User
from app.schemas.billing import CheckoutRequest, CheckoutResponse, OrderResponse, ProductResponse
from app.services.billing.billing_service import BillingService
from app.services.billing.gateway import PaymentGateway, get_payment_gateway

router = APIRouter(prefix="/billing", tags=["billing"], dependencies=[Depends(require_saas)])


def _billing(db: Session = Depends(get_db), gateway: PaymentGateway = Depends(get_payment_gateway)) -> BillingService:
    return BillingService(db, gateway)


def _require_fake_outside_production() -> None:
    s = get_settings()
    if s.PAYMENT_GATEWAY != "fake" or s.APP_ENV == "production":
        raise NotFoundError("No encontrado.")


@router.get("/products", response_model=list[ProductResponse])
def list_products(billing: BillingService = Depends(_billing)) -> list[ProductResponse]:
    return [ProductResponse.model_validate(p) for p in billing.list_products()]


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(
    body: CheckoutRequest, billing: BillingService = Depends(_billing), user: User = Depends(get_current_user)
) -> CheckoutResponse:
    order, url = billing.checkout(user.id, body.product_code, body.idempotency_key)
    return CheckoutResponse(order_id=order.id, checkout_url=url)


@router.post("/webhooks/{gateway}")
async def webhook(gateway: str, request: Request, billing: BillingService = Depends(_billing)) -> dict:
    """No user and no cookies (T8): authenticity comes only from the gateway's signature."""
    if gateway != get_settings().PAYMENT_GATEWAY:
        raise NotFoundError("No encontrado.")
    if gateway == "fake":
        _require_fake_outside_production()
    body = await request.body()
    # The service queries the DB and the gateway's API: keep that off the event loop.
    await run_in_threadpool(billing.handle_webhook, request.headers, request.query_params, body)
    return {"received": True}


@router.get("/orders", response_model=list[OrderResponse])
def list_orders(billing: BillingService = Depends(_billing), user: User = Depends(get_current_user)) -> list[OrderResponse]:
    return [OrderResponse.model_validate(o) for o in billing.list_orders(user.id)]


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: int, billing: BillingService = Depends(_billing), user: User = Depends(get_current_user)
) -> OrderResponse:
    return OrderResponse.model_validate(billing.get_order(user.id, order_id))


@router.post(
    "/fake/complete/{order_id}", response_model=OrderResponse, dependencies=[Depends(_require_fake_outside_production)]
)
def fake_complete(
    order_id: int, billing: BillingService = Depends(_billing), user: User = Depends(get_current_user)
) -> OrderResponse:
    return OrderResponse.model_validate(billing.fake_complete(user.id, order_id))
