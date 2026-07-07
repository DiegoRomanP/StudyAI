"""Text chunking.

Uses LangChain's ``RecursiveCharacterTextSplitter`` when available (matching the
plan's spec of ~500-token chunks with 50-token overlap). Falls back to an
equivalent pure-Python recursive splitter so the RAG pipeline works without the
LangChain dependency.

Chunk sizes are expressed in characters using an approximate 4 chars/token ratio
so behaviour is consistent across both backends.
"""

from __future__ import annotations

CHARS_PER_TOKEN = 4
DEFAULT_CHUNK_TOKENS = 500
DEFAULT_OVERLAP_TOKENS = 50

_CHUNK_CHARS = DEFAULT_CHUNK_TOKENS * CHARS_PER_TOKEN
_OVERLAP_CHARS = DEFAULT_OVERLAP_TOKENS * CHARS_PER_TOKEN
_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


def chunk_text(text: str) -> list[str]:
    """Split ``text`` into overlapping chunks."""
    text = (text or "").strip()
    if not text:
        return []

    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=_CHUNK_CHARS,
            chunk_overlap=_OVERLAP_CHARS,
            separators=_SEPARATORS,
        )
        return [c for c in splitter.split_text(text) if c.strip()]
    except ImportError:
        return _fallback_split(text)


def _fallback_split(text: str) -> list[str]:
    """Sliding-window splitter that prefers to break on separators."""
    chunks: list[str] = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + _CHUNK_CHARS, length)
        if end < length:
            end = _best_break(text, start, end)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= length:
            break
        start = max(end - _OVERLAP_CHARS, start + 1)

    return chunks


def _best_break(text: str, start: int, hard_end: int) -> int:
    """Find the latest separator boundary before ``hard_end`` (within window)."""
    window = text[start:hard_end]
    for sep in _SEPARATORS:
        if not sep:
            continue
        idx = window.rfind(sep)
        # Only honour the boundary if it is reasonably far into the window.
        if idx != -1 and idx > _CHUNK_CHARS // 2:
            return start + idx + len(sep)
    return hard_end
