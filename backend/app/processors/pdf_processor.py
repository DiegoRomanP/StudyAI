"""PDF text extraction via PyMuPDF (``fitz``).

PyMuPDF is imported lazily so the application boots even when it is not
installed; the import error only surfaces when a PDF is actually processed.
"""

from __future__ import annotations

from app.core.exceptions import ProcessingError
from app.processors.base import BaseProcessor


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
