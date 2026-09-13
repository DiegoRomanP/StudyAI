"""Deleting a document must remove its DB row and its stored file.

Regression test for the "documents pile up forever" bug: the UI had no way to
delete an uploaded document, and nothing on the backend supported it either.
"""

import io
import os

import pytest
from fastapi.testclient import TestClient

import main
from app.db.session import SessionLocal
from app.models.document import Document


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def _upload(client: TestClient, name: str = "notes.md") -> int:
    files = {"file": (name, io.BytesIO(b"# Notes\n\nSome content."), "text/markdown")}
    r = client.post("/documents/upload", files=files)
    assert r.status_code == 201
    return r.json()["id"]


def test_delete_document_removes_record_and_stored_file(client: TestClient):
    doc_id = _upload(client)

    db = SessionLocal()
    storage_path = db.get(Document, doc_id).storage_path
    db.close()
    assert os.path.exists(storage_path)

    r = client.delete(f"/documents/{doc_id}")
    assert r.status_code == 204

    assert not os.path.exists(storage_path)
    assert client.get(f"/documents/{doc_id}").status_code == 404
    assert doc_id not in [d["id"] for d in client.get("/documents").json()]


def test_delete_document_twice_returns_404_the_second_time(client: TestClient):
    doc_id = _upload(client, "notes2.md")

    assert client.delete(f"/documents/{doc_id}").status_code == 204
    assert client.delete(f"/documents/{doc_id}").status_code == 404


def test_delete_nonexistent_document_returns_404(client: TestClient):
    r = client.delete("/documents/999999")
    assert r.status_code == 404
