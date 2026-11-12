"""Deployment facts the frontend needs to decide what to show."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["system"])


@router.get("/config")
def get_config() -> dict[str, str]:
    # The backend still enforces every mode; this only lets the UI hide what does not apply.
    return {"deployment_mode": get_settings().DEPLOYMENT_MODE, "auth_mode": "demo"}
