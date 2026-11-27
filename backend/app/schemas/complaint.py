"""Complaints book DTOs (contract: docs/api_contract.yaml, POST /complaints)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


def _text(max_length: int) -> type[str]:
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)]


class ComplaintCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: _text(120)
    document_id: _text(20)
    address: _text(255)
    phone: _text(30)
    # Shape check only (no email-validator dependency): the address is for replying, not for login.
    email: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    ]
    kind: Literal["reclamo", "queja"]
    amount_cents: int | None = Field(default=None, ge=0, le=1_000_000_000)
    detail: _text(5000)
    request: _text(2000)


class ComplaintCreated(BaseModel):
    code: str
    created_at: datetime
