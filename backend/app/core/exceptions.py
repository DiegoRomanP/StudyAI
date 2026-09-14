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
    """A classified, safe-to-display language model failure.

    ``message`` is deliberately the public message.  Provider response bodies,
    SDK exception text, request payloads, and credentials must never be used to
    construct this error because it is returned by the HTTP exception handler.
    """

    def __init__(
        self,
        message: str = "No se pudo completar la solicitud al proveedor de IA.",
        *,
        code: str = "LLM_PROVIDER_ERROR",
        provider: str | None = None,
        upstream_status: int | None = None,
        retryable: bool = False,
        retry_after_seconds: float | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.provider = provider
        self.upstream_status = upstream_status
        self.retryable = retryable
        self.retry_after_seconds = retry_after_seconds
