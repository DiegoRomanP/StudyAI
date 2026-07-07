"""Factory that maps a file extension to its processor (Factory Pattern)."""

from __future__ import annotations

from app.core.exceptions import UnsupportedFileTypeError
from app.processors.base import BaseProcessor
from app.processors.markdown_processor import MarkdownProcessor
from app.processors.pdf_processor import PDFProcessor

# Registry keyed by normalised extension (no leading dot, lower-case).
_REGISTRY: dict[str, type[BaseProcessor]] = {
    "pdf": PDFProcessor,
    "md": MarkdownProcessor,
    "markdown": MarkdownProcessor,
}

SUPPORTED_EXTENSIONS = tuple(sorted(_REGISTRY))


class DocumentProcessorFactory:
    @staticmethod
    def create(file_type: str) -> BaseProcessor:
        key = file_type.lower().lstrip(".")
        processor_cls = _REGISTRY.get(key)
        if processor_cls is None:
            raise UnsupportedFileTypeError(
                f"Unsupported file type '{file_type}'. "
                f"Supported: {', '.join(SUPPORTED_EXTENSIONS)}."
            )
        return processor_cls()
