"""Ingestion pipeline: Validate -> Parse -> Chunk -> Embed -> Store.

Implements the Pipeline Pattern as an ordered list of steps operating on a
mutable context. Kept intentionally small; each step has a single job so new
stages (OCR, language detection, ...) can be inserted without touching others.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from app.core.exceptions import ProcessingError
from app.core.logging import get_logger
from app.processors.factory import DocumentProcessorFactory
from app.rag.chunker import chunk_text
from app.rag.embedder import Embedder
from app.rag.vector_store import VectorStore

logger = get_logger(__name__)


@dataclass
class IngestionContext:
    document_id: int
    file_path: str
    file_type: str
    text: str = ""
    chunks: list[str] = field(default_factory=list)
    embeddings: list[list[float]] = field(default_factory=list)


@dataclass
class IngestionResult:
    document_id: int
    chunk_count: int


class IngestionPipeline:
    def __init__(
        self,
        vector_store: VectorStore | None = None,
        embedder: Embedder | None = None,
    ) -> None:
        self._store = vector_store or VectorStore()
        self._embedder = embedder or Embedder.instance()

    def run(self, document_id: int, file_path: str, file_type: str) -> IngestionResult:
        ctx = IngestionContext(document_id=document_id, file_path=file_path, file_type=file_type)
        self._validate(ctx)
        self._parse(ctx)
        self._chunk(ctx)
        self._embed(ctx)
        self._store_chunks(ctx)
        logger.info("Indexed document %s into %d chunks", document_id, len(ctx.chunks))
        return IngestionResult(document_id=document_id, chunk_count=len(ctx.chunks))

    # --- steps ---------------------------------------------------------------
    @staticmethod
    def _validate(ctx: IngestionContext) -> None:
        if not Path(ctx.file_path).is_file():
            raise ProcessingError(f"File not found: {ctx.file_path}")

    @staticmethod
    def _parse(ctx: IngestionContext) -> None:
        processor = DocumentProcessorFactory.create(ctx.file_type)
        ctx.text = processor.extract_text(ctx.file_path)
        if not ctx.text.strip():
            raise ProcessingError("Extracted text is empty; nothing to index.")

    @staticmethod
    def _chunk(ctx: IngestionContext) -> None:
        ctx.chunks = chunk_text(ctx.text)
        if not ctx.chunks:
            raise ProcessingError("Chunking produced no chunks.")

    def _embed(self, ctx: IngestionContext) -> None:
        ctx.embeddings = self._embedder.embed(ctx.chunks)

    def _store_chunks(self, ctx: IngestionContext) -> None:
        self._store.delete_by_document_id(ctx.document_id)  # idempotent re-index
        self._store.add(ctx.document_id, ctx.chunks, ctx.embeddings)
