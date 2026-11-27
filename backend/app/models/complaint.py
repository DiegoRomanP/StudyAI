"""Libro de Reclamaciones (Perú): one row per reclamo/queja, numbered per year (``R-2026-000001``)."""

from __future__ import annotations

from sqlalchemy import Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class Complaint(TimestampMixin, Base):
    __tablename__ = "complaints"
    # The unique pair is what makes the correlative safe: a concurrent duplicate fails and retries.
    __table_args__ = (UniqueConstraint("year", "number", name="uq_complaints_year_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(Integer)
    number: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(120))
    document_id: Mapped[str] = mapped_column(String(20))
    address: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str] = mapped_column(String(30))
    email: Mapped[str] = mapped_column(String(254))
    kind: Mapped[str] = mapped_column(String(8))  # "reclamo" | "queja"
    amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[str] = mapped_column(Text)
    request: Mapped[str] = mapped_column(Text)

    @property
    def code(self) -> str:
        return f"R-{self.year}-{self.number:06d}"
