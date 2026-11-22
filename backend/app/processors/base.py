"""Processor abstraction: turn a file on disk into text (Markdown when possible)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ExtractedDocument:
    """Document text plus the images written to ``assets_dir``.

    Each image is referenced in ``text`` as Markdown ``![](path)`` at the spot it appeared.
    """

    text: str
    image_paths: list[str] = field(default_factory=list)


class BaseProcessor(ABC):
    """Extracts text from a single document."""

    @abstractmethod
    def extract_text(self, file_path: str) -> str:  # pragma: no cover - interface
        ...

    def extract(self, file_path: str, assets_dir: str) -> ExtractedDocument:
        """Text and images; formats without images only return text."""
        return ExtractedDocument(self.extract_text(file_path))
