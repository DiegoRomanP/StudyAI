"""PDF extraction: Markdown with images via pymupdf4llm, plain text via PyMuPDF otherwise.

Both libraries are imported lazily so the application boots without them; the
import error only surfaces when a PDF is actually processed.
"""

from __future__ import annotations

import contextlib
import io
import re

from app.core.exceptions import ProcessingError
from app.core.logging import get_logger
from app.processors.base import BaseProcessor, ExtractedDocument

logger = get_logger(__name__)

# Images are always written as PNG; matching up to ".png)" keeps spaces and parentheses in the path.
IMAGE_REF = re.compile(r"!\[[^\]]*\]\((.+?\.png)\)")


class PDFProcessor(BaseProcessor):
    def extract_text(self, file_path: str) -> str:
        try:
            import fitz  # PyMuPDF
        except ImportError as exc:  # pragma: no cover - env dependent
            raise ProcessingError(
                "PyMuPDF (pymupdf) is required to process PDF files. "
                "Install it with `pip install pymupdf`."
            ) from exc

        try:
            parts: list[str] = []
            with fitz.open(file_path) as pdf:
                for page in pdf:
                    parts.append(page.get_text("text"))
        except Exception as exc:  # noqa: BLE001 - normalise to domain error
            raise ProcessingError(f"Failed to read PDF: {exc}") from exc

        return "\n".join(parts).strip()

    def extract(self, file_path: str, assets_dir: str) -> ExtractedDocument:
        """Markdown (headings, tables, formulas as text) with each image saved apart."""
        try:
            # The library prints parser notes to stdout (also on import); keep them out of the log.
            with contextlib.redirect_stdout(io.StringIO()):
                import pymupdf4llm
        except ImportError:
            logger.info("pymupdf4llm not installed; indexing the PDF as plain text without images.")
            return ExtractedDocument(self.extract_text(file_path))
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                markdown = pymupdf4llm.to_markdown(
                    file_path, write_images=True, image_path=assets_dir, image_format="png"
                )
        except Exception:  # noqa: BLE001 - degrade to the plain-text path
            logger.warning("pymupdf4llm failed on %s; falling back to plain text.", file_path, exc_info=True)
            return ExtractedDocument(self.extract_text(file_path))
        return ExtractedDocument(markdown.strip(), IMAGE_REF.findall(markdown))
