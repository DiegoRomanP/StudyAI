"""pgvector backend of VectorStore (only runs against Postgres: TEST_DATABASE_URL)."""

import pytest

from app.core.config import get_settings
from app.db.session import engine
from app.rag.vector_store import VectorStore, _PgVectorStore

pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="needs TEST_DATABASE_URL")


@pytest.fixture
def store(monkeypatch):
    monkeypatch.setattr(get_settings(), "VECTOR_BACKEND", "pgvector")
    s = VectorStore()
    assert isinstance(s._fallback, _PgVectorStore)
    yield s
    for document_id in (9001, 9002):
        s.delete_by_document_id(document_id)


def test_query_returns_the_most_similar_chunk_first(store):
    store.add(9001, ["norte", "este"], [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], {"filename": "a.md"})

    hits = store.query([0.9, 0.1, 0.0], top_k=2, filter_document_ids=[9001])

    assert [h["text"] for h in hits] == ["norte", "este"]
    assert hits[0]["metadata"] == {"document_id": 9001, "filename": "a.md", "chunk_index": 0}
    assert hits[0]["distance"] < hits[1]["distance"]


def test_query_filtered_by_document_ids_ignores_other_documents(store):
    store.add(9001, ["mio"], [[1.0, 0.0, 0.0]])
    store.add(9002, ["ajeno"], [[1.0, 0.0, 0.0]])

    hits = store.query([1.0, 0.0, 0.0], top_k=5, filter_document_ids=[9001])

    assert [h["text"] for h in hits] == ["mio"]


def test_delete_by_document_id_removes_only_that_document(store):
    store.add(9001, ["uno"], [[1.0, 0.0, 0.0]])
    store.add(9002, ["dos"], [[1.0, 0.0, 0.0]])

    store.delete_by_document_id(9001)

    assert [h["text"] for h in store.query([1.0, 0.0, 0.0], top_k=5, filter_document_ids=[9001, 9002])] == ["dos"]


def test_re_adding_a_document_replaces_its_chunks(store):
    store.add(9001, ["viejo"], [[1.0, 0.0, 0.0]])
    store.add(9001, ["nuevo"], [[1.0, 0.0, 0.0]])

    assert [h["text"] for h in store.query([1.0, 0.0, 0.0], top_k=5, filter_document_ids=[9001])] == ["nuevo"]
