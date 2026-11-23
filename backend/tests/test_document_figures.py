"""PDF -> Markdown with figures stored apart, described when the AI can see images."""

import io
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
from app.core.config import get_settings
from app.core.exceptions import LLMError
from app.models.document import Document
from app.models.document_asset import DocumentAsset
from app.models.user import User
from app.processors.base import ExtractedDocument
from app.processors.pdf_processor import PDFProcessor
from app.processors.pipeline import drop_images
from app.services.document_asset_service import FigureDescriber
from tests.helpers import indexed_doc

pymupdf = pytest.importorskip("pymupdf")


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


def _png(path: Path, side: int, color=(30, 120, 200)) -> str:
    pixmap = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, side, side), False)
    pixmap.set_rect(pixmap.irect, color)
    pixmap.save(str(path))
    return str(path)


def _pdf_with_figure() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "La fotosintesis convierte luz en energia quimica. " * 3, fontsize=10)
    pixmap = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 300, 200), False)
    pixmap.set_rect(pixmap.irect, (30, 120, 200))
    page.insert_image(pymupdf.Rect(72, 150, 372, 350), pixmap=pixmap)
    page.insert_text((72, 380), "Figura 1: el cloroplasto.", fontsize=10)
    return doc.tobytes()


class VisionLLM:
    supports_images = True

    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []

    def complete(self, *, kind, system, prompt, context=None, max_tokens=4096):
        self.calls.append((kind, context["image_paths"], max_tokens))
        if self.fail:
            raise LLMError("sin visión", code="LLM_MODEL_UNAVAILABLE")
        return "  Un   cuadrado azul.\n"

    def drain_usage(self):
        return []


def _describe(client, llm, refs):
    text = "Intro " + " ".join(f"![]({ref})" for ref in refs) + " fin"
    document_id = indexed_doc(client)
    with main.SessionLocal() as db:
        out = FigureDescriber(db, document_id, llm)(ExtractedDocument(text, refs))
        rows = db.query(DocumentAsset).filter_by(document_id=document_id).all()
        return out, [(r.id, r.description, r.width) for r in rows]


def test_figures_become_described_markers_and_duplicates_or_icons_are_dropped(client, tmp_path):
    big = _png(tmp_path / "a.png", 200)
    same = _png(tmp_path / "b.png", 200)  # identical bytes: one figure
    icon = _png(tmp_path / "c.png", 16)
    llm = VisionLLM()

    text, rows = _describe(client, llm, [big, same, icon])

    assert len(rows) == 1 and rows[0][1] == "Un cuadrado azul." and rows[0][2] == 200
    assert text.count(f"[figura:{rows[0][0]}] Un cuadrado azul.") == 2
    assert "![](" not in text and str(tmp_path) not in text  # no server path reaches RAG
    assert llm.calls == [("image_description", [big], 512)]
    assert not Path(icon).exists() and not Path(same).exists()


def test_a_failed_description_stops_the_rest_and_keeps_the_figures(client, tmp_path):
    refs = [_png(tmp_path / "a.png", 100, (255, 0, 0)), _png(tmp_path / "b.png", 100, (0, 255, 0))]
    llm = VisionLLM(fail=True)

    text, rows = _describe(client, llm, refs)

    assert len(llm.calls) == 1
    assert len(rows) == 2 and all(description == "" for _, description, _ in rows)
    assert text.count("Figura sin describir.") == 2


def test_a_scanned_pdf_without_described_figures_has_no_text_to_index(client, tmp_path):
    ref = _png(tmp_path / "scan.png", 300)
    document_id = indexed_doc(client)
    with main.SessionLocal() as db:
        out = FigureDescriber(db, document_id, None)(ExtractedDocument(f"![]({ref})\n", [ref]))
        rows = db.query(DocumentAsset).filter_by(document_id=document_id).count()
    assert out == "" and rows == 0 and not Path(ref).exists()  # the pipeline then marks it FAILED


def test_a_figure_path_with_spaces_is_still_replaced(client, tmp_path):
    folder = tmp_path / "My Docs (2)"
    folder.mkdir()
    ref = _png(folder / "a.png", 100)
    text, rows = _describe(client, VisionLLM(), [ref])
    assert len(rows) == 1 and "![](" not in text and str(folder) not in text


def test_providers_without_vision_never_get_figure_calls(client, tmp_path):
    class TextOnly(VisionLLM):
        supports_images = False

    llm = TextOnly()
    _, rows = _describe(client, llm, [_png(tmp_path / "a.png", 100)])
    assert llm.calls == [] and len(rows) == 1


def test_default_describe_step_removes_image_references():
    assert drop_images(ExtractedDocument("a ![](/srv/x.png) b", ["/srv/x.png"])) == "a  b"


def test_pdf_without_pymupdf4llm_falls_back_to_plain_text(tmp_path, monkeypatch):
    pdf = tmp_path / "t.pdf"
    pdf.write_bytes(_pdf_with_figure())
    monkeypatch.setitem(sys.modules, "pymupdf4llm", None)

    extracted = PDFProcessor().extract(str(pdf), str(tmp_path))

    assert "fotosintesis" in extracted.text and extracted.image_paths == []


def test_uploaded_pdf_serves_its_figures_only_to_their_document(client):
    pytest.importorskip("pymupdf4llm")
    files = {"file": ("bio.pdf", io.BytesIO(_pdf_with_figure()), "application/pdf")}
    document_id = client.post("/documents/upload", files=files).json()["id"]
    assert client.get(f"/documents/{document_id}").json()["status"] == "INDEXED"
    with main.SessionLocal() as db:
        (asset,) = db.query(DocumentAsset).filter_by(document_id=document_id).all()
        asset_id, path = asset.id, Path(get_settings().UPLOAD_DIR) / asset.storage_path

    response = client.get(f"/documents/figures/{asset_id}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content[:4] == b"\x89PNG"

    with main.SessionLocal() as db:  # someone else's document: same answer as a missing figure
        stranger = User(email="figures-stranger@example.test")
        db.add(stranger)
        db.flush()
        db.query(Document).filter_by(id=document_id).update({"user_id": stranger.id})
        db.commit()
    assert client.get(f"/documents/figures/{asset_id}").status_code == 404
    assert client.get("/documents/figures/123456").status_code == 404
    with main.SessionLocal() as db:
        db.query(Document).filter_by(id=document_id).update({"user_id": 1})
        db.commit()

    assert client.delete(f"/documents/{document_id}").status_code == 204
    with main.SessionLocal() as db:
        assert db.query(DocumentAsset).filter_by(document_id=document_id).count() == 0
    assert not path.exists()
