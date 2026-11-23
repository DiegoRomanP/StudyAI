"""Document use-cases: upload, index, list."""

from __future__ import annotations

import re
import tempfile
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.document import Document, DocumentStatus
from app.processors.factory import SUPPORTED_EXTENSIONS
from app.processors.pdf_processor import inspect_pdf
from app.processors.pipeline import IngestionPipeline
from app.services.credit_service import CreditService
from app.services.document_asset_service import FigureDescriber, remove_document_assets
from app.storage import get_file_storage
from app.rag.vector_store import VectorStore
from app.repositories.document_repository import DocumentRepository
from app.db.session import SessionLocal

logger = get_logger(__name__)

_MAX_FILENAME = 255  # T2: Postgres enforces VARCHAR lengths, SQLite does not


def sanitize_filename(filename: str) -> str:
    """Display name only (storage uses a generated key): no directories, no control characters."""
    name = re.sub(r"[\x00-\x1f\x7f]", "", re.split(r"[\\/]", filename)[-1]).strip().strip(".")
    suffix = Path(name).suffix[:16]
    return (name[: _MAX_FILENAME - len(suffix)] + suffix) if len(name) > _MAX_FILENAME else name


class DocumentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = DocumentRepository(db)
        self.settings = get_settings()

    def create_upload(
        self, user_id: int, filename: str, content: bytes
    ) -> Document:
        """Validate + persist an uploaded file and its Document row (PENDING)."""
        filename = sanitize_filename(filename)
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
        if ext == "pdf" and not content.startswith(b"%PDF-"):
            raise ValidationError("El archivo no es un PDF válido.")
        if ext == "pdf":
            encrypted, pages = inspect_pdf(content)
            if encrypted:
                raise ValidationError("El PDF está protegido con contraseña.")
            if pages is not None and pages > self.settings.MAX_PDF_PAGES:
                raise ValidationError(f"El PDF supera el máximo de {self.settings.MAX_PDF_PAGES} páginas.")
        if ext != "pdf":
            try:
                content.decode("utf-8")
            except UnicodeDecodeError:
                raise ValidationError("El archivo de texto no es UTF-8 válido.") from None

        if self.settings.is_saas:  # last check: a refused file must not cost a stored copy
            CreditService(self.db).ensure_document_slot(user_id)

        storage_path = f"users/{user_id}/documents/{uuid.uuid4().hex}.{ext}"
        get_file_storage().save(storage_path, content)

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

    def delete_document(self, user_id: int, document_id: int) -> None:
        """Remove a document's DB row, stored file and indexed vectors.

        Vector-store and file cleanup are best-effort: a stale chunk or an
        already-missing file must not stop the DB row (the source of truth for
        "does the user still see this document") from being deleted.
        """
        document = self.get_document(user_id, document_id)

        if document.storage_path:
            try:
                get_file_storage().delete(document.storage_path)
            except Exception:  # noqa: BLE001 - cleanup must not block deletion
                logger.warning("Could not remove stored file for document %s", document_id)

        try:
            VectorStore().delete_by_document_id(document_id)
        except Exception:  # noqa: BLE001 - cleanup must not block deletion
            logger.warning("Could not remove vectors for document %s", document_id, exc_info=True)

        remove_document_assets(self.db, document_id)
        self.repo.delete(document)


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
        llm = None
        try:
            if document.file_type == "pdf":
                from app.llm.factory import resolve_llm_provider  # avoid import cycle

                # Only a vision-capable provider (the agent CLIs) describes figures.
                llm = resolve_llm_provider(db, document.user_id).provider
            with tempfile.TemporaryDirectory(prefix="studyai-assets-") as scratch, \
                    get_file_storage().local_copy(document.storage_path) as source:
                IngestionPipeline().run(
                    document.id, str(source), document.file_type,
                    assets_dir=scratch, describe=FigureDescriber(db, document.id, llm),
                )
            document.status = DocumentStatus.INDEXED
        except Exception as exc:  # noqa: BLE001 - record failure, don't crash
            logger.exception("Failed to index document %s", document_id)
            db.rollback()  # a failed flush in the Describe step would block saving the status
            document.status = DocumentStatus.FAILED
            document.error_message = str(exc)[:1000]
        finally:
            if llm is not None:
                llm.close()
        repo.save(document)
    finally:
        db.close()
