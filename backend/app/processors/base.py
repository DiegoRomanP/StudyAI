"""Processor abstraction: turn a file on disk into plain text."""

from __future__ import annotations

from abc import ABC, abstractmethod


class BaseProcessor(ABC):
    """Extracts plain text from a single document."""

    @abstractmethod
    def extract_text(self, file_path: str) -> str:  # pragma: no cover - interface
        ...
