"""Markdown text extraction (strips YAML front-matter)."""

from __future__ import annotations

from pathlib import Path

from app.core.exceptions import ProcessingError
from app.processors.base import BaseProcessor


class MarkdownProcessor(BaseProcessor):
    def extract_text(self, file_path: str) -> str:
        try:
            raw = Path(file_path).read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            raise ProcessingError(f"Failed to read Markdown file: {exc}") from exc

        return self._strip_frontmatter(raw).strip()

    @staticmethod
    def _strip_frontmatter(text: str) -> str:
        """Remove a leading ``---`` fenced YAML front-matter block if present."""
        if text.startswith("---"):
            end = text.find("\n---", 3)
            if end != -1:
                newline = text.find("\n", end + 1)
                return text[newline + 1 :] if newline != -1 else ""
        return text
