"""Domain-level exceptions.

Kept free of framework imports so any layer (repositories, services, RAG) can
raise them; the API layer maps them to HTTP responses in one place.
"""

from __future__ import annotations


class StudyAIError(Exception):
    """Base class for all application errors."""


class NotFoundError(StudyAIError):
    """A requested entity does not exist."""


class ValidationError(StudyAIError):
    """Input failed a business rule (distinct from Pydantic schema validation)."""


class ConflictError(StudyAIError):
    """The requested change conflicts with the credential's current state."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


class UnsupportedFileTypeError(StudyAIError):
    """No processor is registered for the given file extension."""


class ProcessingError(StudyAIError):
    """A document could not be parsed, chunked, embedded or stored."""


class LLMError(StudyAIError):
    """The language model call failed or returned unusable output."""
