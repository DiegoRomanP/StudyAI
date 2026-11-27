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


class AuthenticationError(StudyAIError):
    """Missing or invalid credentials (HTTP 401) with a stable ``code``."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


class DailyLimitError(StudyAIError):
    """The learner spent today's included free-tier AI uses."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


class InsufficientCreditsError(StudyAIError):
    """No credits left for an AI generation (HTTP 402)."""

    code = "INSUFFICIENT_CREDITS"

    def __init__(self) -> None:
        super().__init__("No te quedan créditos. Recarga para seguir generando con IA.")


class PlanLimitError(StudyAIError):
    """The learner's tier has no room for another document or active goal (HTTP 403)."""

    code = "PLAN_LIMIT_REACHED"


class WebhookError(StudyAIError):
    """A payment notification failed verification (HTTP 400). Never says why: no oracle for forgers."""

    code = "WEBHOOK_INVALID"

    def __init__(self) -> None:
        super().__init__("Notificación inválida.")


class PaymentGatewayError(StudyAIError):
    """The payment gateway failed or answered something unusable (HTTP 502)."""

    code = "PAYMENT_GATEWAY_ERROR"

    def __init__(self) -> None:
        super().__init__("La pasarela de pago no respondió. Inténtalo de nuevo en unos minutos.")


class PlanDocumentsUnavailableError(StudyAIError):
    """A plan was requested with documents the caller cannot use.

    ``document_ids`` lists the offending IDs (empty when none were sent). IDs
    that do not exist and IDs owned by another user are reported identically,
    so the response never reveals other users' documents.
    """

    code = "PLAN_DOCUMENTS_UNAVAILABLE"

    def __init__(self, message: str, document_ids: list[int]) -> None:
        super().__init__(message)
        self.document_ids = document_ids


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
