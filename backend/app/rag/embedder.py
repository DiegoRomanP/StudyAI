"""Text embedding with a lazy singleton model and a deterministic fallback.

Primary backend: sentence-transformers ``all-MiniLM-L6-v2`` (384-dim). If the
package/model isn't available, a deterministic hashing embedder produces vectors
of the same dimensionality so the pipeline stays functional (retrieval quality
is degraded but the app runs). Swap in the real model by installing
``sentence-transformers``.
"""

from __future__ import annotations

import hashlib
import math

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

EMBEDDING_DIM = 384  # all-MiniLM-L6-v2 output size


class Embedder:
    """Lazy singleton wrapper around the embedding model."""

    _instance: "Embedder | None" = None

    def __init__(self) -> None:
        self._model = None
        self._loaded = False
        self._using_fallback = False

    @classmethod
    def instance(cls) -> "Embedder":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        settings = get_settings()
        try:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(settings.EMBEDDING_MODEL)
            logger.info("Loaded embedding model '%s'", settings.EMBEDDING_MODEL)
        except Exception as exc:  # noqa: BLE001 - fall back gracefully
            self._using_fallback = True
            logger.warning(
                "sentence-transformers unavailable (%s); using deterministic "
                "hashing embedder. Install it for real semantic search.",
                exc,
            )

    @property
    def using_fallback(self) -> bool:
        self._ensure_loaded()
        return self._using_fallback

    def embed(self, texts: list[str]) -> list[list[float]]:
        self._ensure_loaded()
        if not texts:
            return []
        if self._model is not None:
            vectors = self._model.encode(texts, normalize_embeddings=True)
            return [list(map(float, v)) for v in vectors]
        return [self._hash_embed(t) for t in texts]

    @staticmethod
    def _hash_embed(text: str) -> list[float]:
        """Bag-of-words hashing into a fixed vector, L2-normalised.

        Deterministic and dependency-free. Good enough to keep the vector store
        and retriever exercised end-to-end in the MVP.
        """
        vector = [0.0] * EMBEDDING_DIM
        for token in text.lower().split():
            digest = hashlib.md5(token.encode("utf-8")).digest()  # noqa: S324
            index = int.from_bytes(digest[:4], "little") % EMBEDDING_DIM
            sign = 1.0 if digest[4] & 1 else -1.0
            vector[index] += sign
        norm = math.sqrt(sum(component * component for component in vector))
        if norm == 0.0:
            return vector
        return [component / norm for component in vector]
