"""An image extracted from an uploaded document (a figure, chart or scanned formula)."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class DocumentAsset(TimestampMixin, Base):
    __tablename__ = "document_assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    # The FK cascade is inert on SQLite (foreign_keys stays off): DocumentService deletes these rows.
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    storage_path: Mapped[str] = mapped_column(String(1024))
    sha256: Mapped[str] = mapped_column(String(64))
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    # Empty until a vision-capable AI describes it; the text that enters RAG.
    description: Mapped[str] = mapped_column(Text, default="")
