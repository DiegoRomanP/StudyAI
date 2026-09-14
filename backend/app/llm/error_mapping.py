"""Classify upstream LLM failures without retaining provider response bodies."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import math
import httpx

from app.core.exceptions import LLMError

_OPENAI_COMPATIBLE_CODES = {
    "auth": frozenset({"authentication_error", "invalid_api_key", "invalid_authentication"}),
    "quota": frozenset({"billing_error", "billing_hard_limit_reached", "insufficient_quota", "quota_exceeded"}),
    "model": frozenset({"invalid_model", "model_decommissioned", "model_not_available", "model_not_found"}),
    "unsupported": frozenset({"invalid_parameter", "unsupported_parameter", "unsupported_value"}),
}
_ANTHROPIC_CODES = {
    "auth": frozenset({"authentication_error"}),
    "quota": frozenset({"billing_error", "credit_balance_too_low"}),
    "model": frozenset({"model_not_found", "not_found_error"}),
    "unsupported": frozenset({"invalid_request_error", "invalid_parameter"}),
}
# These providers use the OpenAI-compatible error protocol, but rules are selected
# by provider so a code from an unknown proxy can never trigger credential revocation.
_PROVIDER_CODES = {
    "OPENAI": _OPENAI_COMPATIBLE_CODES,
    "GLM": _OPENAI_COMPATIBLE_CODES,
    "OPENROUTER": _OPENAI_COMPATIBLE_CODES,
    "NVIDIA": _OPENAI_COMPATIBLE_CODES,
    "HUGGINGFACE": _OPENAI_COMPATIBLE_CODES,
    "OLLAMA": _OPENAI_COMPATIBLE_CODES,
    "ANTHROPIC": _ANTHROPIC_CODES,
}
_RETRYABLE_SERVER_STATUS_CODES = {500, 502, 503, 504}
_TOKEN_LIMIT_PARAMETERS = frozenset({"max_tokens", "max_completion_tokens"})
_RESPONSE_DESERIALIZATION_ERROR_NAMES = frozenset(
    {"APIResponseValidationError", "JSONDecodeError", "ResponseValidationError"}
)


@dataclass(frozen=True)
class _ErrorMetadata:
    codes: frozenset[str] = frozenset()
    parameter: str | None = None


def map_http_error(provider: str, response: httpx.Response) -> LLMError:
    """Map a failed HTTP response using only status and known structured codes."""
    return _map_status(
        provider,
        response.status_code,
        _known_error_metadata(response),
        retry_after_seconds=_retry_after_seconds(response),
    )


def map_sdk_error(provider: str, error: BaseException) -> LLMError:
    """Map SDK errors by their public type/status metadata, never their text."""
    error_name = type(error).__name__
    if _is_response_deserialization_error(error, error_name):
        return invalid_response_error(provider)
    status = getattr(error, "status_code", None)
    body = getattr(error, "body", None)
    metadata = _known_error_metadata_from_data(body)
    retry_after_seconds = _retry_after_seconds(getattr(error, "response", None))

    if isinstance(status, int):
        sdk_code = _code_from_sdk_name(error_name)
        if sdk_code is not None:
            metadata = _ErrorMetadata(
                codes=metadata.codes | frozenset({sdk_code}), parameter=metadata.parameter
            )
        return _map_status(
            provider, status, metadata, retry_after_seconds=retry_after_seconds
        )
    if error_name in {"APITimeoutError", "TimeoutError"}:
        return _error(provider, "LLM_TIMEOUT", "La solicitud al proveedor de IA agotó el tiempo de espera.", retryable=True)
    if error_name in {"APIConnectionError", "ConnectionError"}:
        return _error(provider, "LLM_CONNECTION_FAILED", "No se pudo conectar con el proveedor de IA.", retryable=True)
    return _error(provider, "LLM_PROVIDER_ERROR", "El proveedor de IA no pudo completar la solicitud.")


def _is_response_deserialization_error(error: BaseException, error_name: str) -> bool:
    if error_name in _RESPONSE_DESERIALIZATION_ERROR_NAMES:
        return True
    return error_name == "ValidationError" and type(error).__module__.startswith(
        ("pydantic", "pydantic_core")
    )


def map_transport_error(provider: str, error: httpx.HTTPError) -> LLMError:
    if isinstance(error, httpx.TimeoutException):
        return _error(provider, "LLM_TIMEOUT", "La solicitud al proveedor de IA agotó el tiempo de espera.", retryable=True)
    if isinstance(error, httpx.RequestError):
        return _error(provider, "LLM_CONNECTION_FAILED", "No se pudo conectar con el proveedor de IA.", retryable=True)
    return _error(provider, "LLM_PROVIDER_ERROR", "El proveedor de IA no pudo completar la solicitud.")


def invalid_response_error(provider: str) -> LLMError:
    return _error(provider, "LLM_INVALID_RESPONSE", "El proveedor de IA devolvió una respuesta inválida.")


def empty_response_error(provider: str) -> LLMError:
    return _error(provider, "LLM_INVALID_RESPONSE", "El proveedor de IA no devolvió contenido utilizable.")


def output_limit_error(provider: str) -> LLMError:
    return _error(
        provider,
        "LLM_OUTPUT_LIMIT",
        "El proveedor de IA agotó el presupuesto de salida antes de completar la respuesta.",
    )


def refusal_error(provider: str) -> LLMError:
    return _error(
        provider,
        "LLM_REFUSED",
        "El proveedor de IA rechazó generar esta respuesta.",
    )


def timeout_error(provider: str) -> LLMError:
    return _error(
        provider,
        "LLM_TIMEOUT",
        "La solicitud al proveedor de IA agotó el tiempo de espera.",
        retryable=True,
    )


def _map_status(
    provider: str,
    status: int,
    metadata: _ErrorMetadata,
    *,
    retry_after_seconds: float | None = None,
) -> LLMError:
    provider_codes = _PROVIDER_CODES.get(provider.upper(), {})
    if 500 <= status <= 599:
        return _error(
            provider,
            "LLM_PROVIDER_UNAVAILABLE",
            "El proveedor de IA no está disponible temporalmente.",
            status,
            retryable=status in _RETRYABLE_SERVER_STATUS_CODES,
        )
    # Status codes take priority over optional provider body metadata. This avoids
    # treating a proxy's misleading code as proof that a credential is invalid.
    if status == 401:
        return _error(provider, "LLM_AUTHENTICATION_FAILED", "El proveedor de IA rechazó la autenticación. Revisa o reemplaza la clave.", status)
    if metadata.codes & provider_codes.get("quota", frozenset()):
        return _error(provider, "LLM_QUOTA_EXHAUSTED", "La cuota o el saldo del proveedor de IA se agotó.", status)
    if status == 402:
        return _error(provider, "LLM_QUOTA_EXHAUSTED", "La cuota o el saldo del proveedor de IA se agotó.", status)
    if status == 403:
        return _error(provider, "LLM_ACCESS_DENIED", "El proveedor de IA rechazó el acceso al modelo. Revisa permisos y disponibilidad.", status)
    if status in {404, 410} and metadata.codes & provider_codes.get("model", frozenset()):
        return _error(provider, "LLM_MODEL_UNAVAILABLE", "El modelo seleccionado no está disponible en el proveedor de IA.", status)
    if status in {404, 410}:
        return _error(provider, "LLM_ENDPOINT_OR_MODEL_UNAVAILABLE", "No se encontró el endpoint o el modelo del proveedor de IA.", status)
    if status in {400, 422}:
        if status == 400 and metadata.codes & provider_codes.get("auth", frozenset()):
            return _error(provider, "LLM_AUTHENTICATION_FAILED", "El proveedor de IA rechazó la autenticación. Revisa o reemplaza la clave.", status)
        if (
            metadata.codes & provider_codes.get("unsupported", frozenset())
            or (
                bool(provider_codes)
                and metadata.parameter in _TOKEN_LIMIT_PARAMETERS
            )
        ):
            return _error(provider, "LLM_UNSUPPORTED_REQUEST", "El proveedor de IA no admite esta solicitud para el modelo seleccionado.", status)
    if status == 429:
        if metadata.codes & provider_codes.get("quota", frozenset()):
            return _error(provider, "LLM_QUOTA_EXHAUSTED", "La cuota o el saldo del proveedor de IA se agotó.", status)
        return _error(provider, "LLM_RATE_LIMITED", "El proveedor de IA está limitando temporalmente las solicitudes.", status, retryable=True, retry_after_seconds=retry_after_seconds)
    return _error(provider, "LLM_PROVIDER_ERROR", "El proveedor de IA no pudo completar la solicitud.", status)


def _error(
    provider: str,
    code: str,
    message: str,
    upstream_status: int | None = None,
    *,
    retryable: bool = False,
    retry_after_seconds: float | None = None,
) -> LLMError:
    return LLMError(
        message,
        code=code,
        provider=provider,
        upstream_status=upstream_status,
        retryable=retryable,
        retry_after_seconds=retry_after_seconds,
    )


def _known_error_metadata(response: httpx.Response) -> _ErrorMetadata:
    try:
        return _known_error_metadata_from_data(response.json())
    except (ValueError, TypeError):
        return _ErrorMetadata()


def _known_error_metadata_from_data(data: object) -> _ErrorMetadata:
    if not isinstance(data, Mapping):
        return _ErrorMetadata()
    error = data.get("error", data)
    if not isinstance(error, Mapping):
        return _ErrorMetadata()
    codes = []
    for field in ("code", "type"):
        value = error.get(field)
        if isinstance(value, str):
            codes.append(value.casefold())
    parameter = error.get("param")
    return _ErrorMetadata(
        codes=frozenset(codes), parameter=parameter.casefold() if isinstance(parameter, str) else None
    )


def _code_from_sdk_name(error_name: str) -> str | None:
    return {
        "AuthenticationError": "authentication_error",
        "PermissionDeniedError": "permission_error",
        "NotFoundError": "not_found_error",
        "RateLimitError": "rate_limit_error",
        "BillingError": "billing_error",
    }.get(error_name)


def _retry_after_seconds(response: object) -> float | None:
    headers = getattr(response, "headers", None)
    get_header = getattr(headers, "get", None)
    if not callable(get_header):
        return None
    value = get_header("retry-after")
    if not isinstance(value, str):
        return None
    try:
        seconds = float(value)
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(value)
        except (TypeError, ValueError, IndexError, OverflowError):
            return None
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        return max((retry_at - datetime.now(timezone.utc)).total_seconds(), 0.0)
    return max(seconds, 0.0) if math.isfinite(seconds) else None
