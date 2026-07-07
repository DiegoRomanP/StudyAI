"""Retriever: embed a query and fetch the most relevant chunks."""

from __future__ import annotations

from app.rag.embedder import Embedder
from app.rag.vector_store import VectorStore


class Retriever:
    def __init__(
        self,
        vector_store: VectorStore | None = None,
        embedder: Embedder | None = None,
    ) -> None:
        self._store = vector_store or VectorStore()
        self._embedder = embedder or Embedder.instance()

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        document_ids: list[int] | None = None,
    ) -> list[dict]:
        """Return up to ``top_k`` chunks (text + metadata) most similar to ``query``."""
        embedding = self._embedder.embed([query])[0]
        return self._store.query(embedding, top_k=top_k, filter_document_ids=document_ids)

    def retrieve_texts(
        self, query: str, top_k: int = 5, document_ids: list[int] | None = None
    ) -> list[str]:
        return [hit["text"] for hit in self.retrieve(query, top_k, document_ids)]
