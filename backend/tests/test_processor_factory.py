"""Unit tests for the document processor factory."""

import pytest

from app.core.exceptions import UnsupportedFileTypeError
from app.processors.factory import DocumentProcessorFactory
from app.processors.markdown_processor import MarkdownProcessor
from app.processors.pdf_processor import PDFProcessor


def test_creates_pdf_processor():
    assert isinstance(DocumentProcessorFactory.create("pdf"), PDFProcessor)


def test_creates_markdown_processor():
    assert isinstance(DocumentProcessorFactory.create("md"), MarkdownProcessor)
    assert isinstance(DocumentProcessorFactory.create(".MD"), MarkdownProcessor)


def test_unsupported_type_raises():
    with pytest.raises(UnsupportedFileTypeError):
        DocumentProcessorFactory.create("docx")


def test_markdown_strips_frontmatter(tmp_path):
    f = tmp_path / "note.md"
    f.write_text("---\ntitle: X\n---\n# Cuerpo\nContenido real.", encoding="utf-8")
    text = MarkdownProcessor().extract_text(str(f))
    assert "title: X" not in text
    assert "Contenido real." in text
