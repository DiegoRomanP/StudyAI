"""User entity."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), default="")
    # Supabase ``sub``; null for the demo user.
    supabase_user_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True, nullable=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(nullable=True)
    # Credit caches, kept coherent with ``credit_ledger`` by CreditService (saas only).
    credit_balance: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    pass_credits: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    pass_expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
