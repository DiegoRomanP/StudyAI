"""Upload content checks: magic bytes, UTF-8, size, sanitized names."""

import io

import pytest
from fastapi.testclient import TestClient

import main
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.document import Document
from app.services.document_service import sanitize_filename


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def _post(client, name, content):
    return client.post("/documents/upload", files={"file": (name, io.BytesIO(content), "application/octet-stream")})


def test_pdf_without_magic_bytes_is_rejected(client):
    r = _post(client, "fake.pdf", b"<html>not a pdf</html>")
    assert r.status_code == 400
    assert "El archivo no es un PDF válido." in r.text


def test_markdown_must_be_utf8(client):
    assert _post(client, "n.md", b"\xff\xfe\x00bad").status_code == 400
    assert _post(client, "n.md", "# acción".encode()).status_code == 201


def test_oversized_upload_is_rejected(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "MAX_UPLOAD_MB", 0)
    assert _post(client, "big.md", b"x").status_code == 400


def test_path_traversal_name_is_sanitized_and_key_is_generated(client):
    r = _post(client, "../../etc/passwd.md", b"# x")
    assert r.status_code == 201
    with SessionLocal() as db:
        doc = db.get(Document, r.json()["id"])
        assert doc.filename == "passwd.md"
        assert doc.storage_path.startswith("users/") and ".." not in doc.storage_path


def test_sanitize_filename():
    assert sanitize_filename("a\\b\\c.md") == "c.md"
    assert sanitize_filename("x\x00y.md") == "xy.md"
    long = sanitize_filename("a" * 400 + ".pdf")
    assert len(long) == 255 and long.endswith(".pdf")
