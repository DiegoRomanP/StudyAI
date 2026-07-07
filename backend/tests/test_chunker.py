"""Unit tests for the text chunker (fallback splitter path)."""

from app.rag import chunker


def test_empty_text_yields_no_chunks():
    assert chunker.chunk_text("") == []
    assert chunker.chunk_text("   ") == []


def test_long_text_splits_into_multiple_chunks():
    text = "palabra " * 1500  # ~10.5k chars, well above one chunk
    chunks = chunker.chunk_text(text)
    assert len(chunks) > 1
    assert all(c.strip() for c in chunks)


def test_short_text_is_single_chunk():
    chunks = chunker.chunk_text("Un texto corto.")
    assert chunks == ["Un texto corto."]
