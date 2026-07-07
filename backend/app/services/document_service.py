"""Document use-cases: upload, index, list."""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.document import Document, DocumentStatus
from app.processors.factory import SUPPORTED_EXTENSIONS
from app.processors.pipeline import IngestionPipeline
from app.repositories.document_repository import DocumentRepository
from app.db.session import SessionLocal

logger = get_logger(__name__)


class DocumentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = DocumentRepository(db)
        self.settings = get_settings()

    def create_upload(
        self, user_id: int, filename: str, content: bytes
    ) -> Document:
        """Validate + persist an uploaded file and its Document row (PENDING)."""
        ext = Path(filename).suffix.lower().lstrip(".")
        if ext not in SUPPORTED_EXTENSIONS:
            raise ValidationError(
                f"Tipo de archivo no soportado: .{ext}. "
                f"Permitidos: {', '.join(SUPPORTED_EXTENSIONS)}."
            )
        if len(content) > self.settings.max_upload_bytes:
            raise ValidationError(
                f"El archivo supera el máximo de {self.settings.MAX_UPLOAD_MB} MB."
            )
        if not content:
            raise ValidationError("El archivo está vacío.")

        os.makedirs(self.settings.UPLOAD_DIR, exist_ok=True)
        safe_name = f"{uuid.uuid4().hex}.{ext}"
        storage_path = os.path.join(self.settings.UPLOAD_DIR, safe_name)
        with open(storage_path, "wb") as fh:
            fh.write(content)

        document = Document(
            user_id=user_id,
            filename=filename,
            file_type=ext if ext != "markdown" else "md",
            file_size=len(content),
            storage_path=storage_path,
            status=DocumentStatus.PENDING,
        )
        return self.repo.save(document)

    def list_documents(self, user_id: int) -> list[Document]:
        return self.repo.list_for_user(user_id)

    def get_document(self, user_id: int, document_id: int) -> Document:
        document = self.repo.find_by_id(document_id)
        if document is None or document.user_id != user_id:
            raise NotFoundError("Documento no encontrado.")
        return document


def index_document_task(document_id: int) -> None:
    """Background task: parse -> chunk -> embed -> store; update status.

    Opens its own DB session because the request-scoped one is already closed by
    the time a FastAPI BackgroundTask runs.
    """
    db = SessionLocal()
    try:
        repo = DocumentRepository(db)
        document = repo.find_by_id(document_id)
        if document is None:
            logger.warning("index_document_task: document %s not found", document_id)
            return
        try:
            pipeline = IngestionPipeline()
            pipeline.run(document.id, document.storage_path, document.file_type)
            document.status = DocumentStatus.INDEXED
        except Exception as exc:  # noqa: BLE001 - record failure, don't crash
            logger.exception("Failed to index document %s", document_id)
            document.status = DocumentStatus.FAILED
        repo.save(document)
    finally:
        db.close()
