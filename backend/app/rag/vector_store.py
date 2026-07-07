"""Vector store wrapper.

Primary backend: persistent ChromaDB. Fallback: a small in-memory cosine store
(pure Python, JSON-persisted) so retrieval works without ChromaDB installed.
Both expose the same interface, so callers never branch on the backend.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_COLLECTION = "studyai_documents"


class VectorStore:
    """Add, query and delete chunk embeddings keyed by document id."""

    def __init__(self) -> None:
        settings = get_settings()
        self._persist_dir = settings.CHROMA_PERSIST_DIR
        os.makedirs(self._persist_dir, exist_ok=True)
        self._collection = None
        self._fallback: _InMemoryStore | None = None
        self._init_backend()

    def _init_backend(self) -> None:
        try:
            import chromadb

            client = chromadb.PersistentClient(path=self._persist_dir)
            self._collection = client.get_or_create_collection(
                name=_COLLECTION, metadata={"hnsw:space": "cosine"}
            )
            logger.info("Using ChromaDB vector store at %s", self._persist_dir)
        except Exception as exc:  # noqa: BLE001 - fall back gracefully
            logger.warning(
                "ChromaDB unavailable (%s); using in-memory cosine store.", exc
            )
            self._fallback = _InMemoryStore(Path(self._persist_dir) / "fallback.json")

    def add(
        self,
        document_id: int,
        chunks: list[str],
        embeddings: list[list[float]],
        metadata: dict | None = None,
    ) -> None:
        if not chunks:
            return
        base_meta = {"document_id": document_id, **(metadata or {})}
        ids = [f"doc-{document_id}-chunk-{i}" for i in range(len(chunks))]
        metadatas = [dict(base_meta, chunk_index=i) for i in range(len(chunks))]

        if self._collection is not None:
            self._collection.upsert(
                ids=ids, documents=chunks, embeddings=embeddings, metadatas=metadatas
            )
        else:
            self._fallback.add(ids, chunks, embeddings, metadatas)  # type: ignore[union-attr]

    def query(
        self,
        embedding: list[float],
        top_k: int = 5,
        filter_document_ids: list[int] | None = None,
    ) -> list[dict]:
        if self._collection is not None:
            where = None
            if filter_document_ids:
                where = {"document_id": {"$in": list(filter_document_ids)}}
            result = self._collection.query(
                query_embeddings=[embedding], n_results=top_k, where=where
            )
            docs = (result.get("documents") or [[]])[0]
            metas = (result.get("metadatas") or [[]])[0]
            dists = (result.get("distances") or [[]])[0]
            return [
                {"text": d, "metadata": m, "distance": dist}
                for d, m, dist in zip(docs, metas, dists)
            ]
        return self._fallback.query(embedding, top_k, filter_document_ids)  # type: ignore[union-attr]

    def delete_by_document_id(self, document_id: int) -> None:
        if self._collection is not None:
            self._collection.delete(where={"document_id": document_id})
        else:
            self._fallback.delete_by_document_id(document_id)  # type: ignore[union-attr]


class _InMemoryStore:
    """Minimal cosine-similarity store persisted as JSON."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._items: list[dict] = []
        if path.exists():
            try:
                self._items = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                self._items = []

    def _flush(self) -> None:
        try:
            self._path.write_text(json.dumps(self._items), encoding="utf-8")
        except OSError:
            logger.warning("Could not persist in-memory vector store to disk.")

    def add(
        self,
        ids: list[str],
        chunks: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict],
    ) -> None:
        existing = {item["id"] for item in self._items}
        for id_, text, emb, meta in zip(ids, chunks, embeddings, metadatas):
            if id_ in existing:
                continue
            self._items.append({"id": id_, "text": text, "embedding": emb, "metadata": meta})
        self._flush()

    def query(
        self, embedding: list[float], top_k: int, filter_document_ids: list[int] | None
    ) -> list[dict]:
        allowed = set(filter_document_ids) if filter_document_ids else None
        scored: list[tuple[float, dict]] = []
        for item in self._items:
            if allowed is not None and item["metadata"].get("document_id") not in allowed:
                continue
            similarity = _cosine(embedding, item["embedding"])
            scored.append((similarity, item))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [
            {"text": item["text"], "metadata": item["metadata"], "distance": 1.0 - sim}
            for sim, item in scored[:top_k]
        ]

    def delete_by_document_id(self, document_id: int) -> None:
        self._items = [
            item for item in self._items if item["metadata"].get("document_id") != document_id
        ]
        self._flush()


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)
