"""Document entity and its lifecycle status."""

from __future__ import annotations

import enum

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class DocumentStatus(str, enum.Enum):
    """Ingestion state of an uploaded document."""

    PENDING = "PENDING"      # stored, not yet indexed
    INDEXED = "INDEXED"      # chunked + embedded + in the vector store
    FAILED = "FAILED"        # processing error


class Document(TimestampMixin, Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    file_type: Mapped[str] = mapped_column(String(16))            # "pdf" | "md"
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    storage_path: Mapped[str] = mapped_column(String(1024), default="")
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus), default=DocumentStatus.PENDING, index=True
    )
    error_message: Mapped[str] = mapped_column(String(1024), default="")
