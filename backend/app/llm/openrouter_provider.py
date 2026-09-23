"""OpenRouter provider using its OpenAI-compatible HTTP API directly."""

from __future__ import annotations

from collections.abc import Mapping

from app.core.config import LLMCallPolicy
from app.core.exceptions import LLMError
from app.llm.base import LLMProvider
from app.llm.error_mapping import invalid_response_error
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.llm.request_profiles import RequestProfile


class OpenRouterProvider(LLMProvider):
    """OpenRouter contract composed over the shared chat-completions transport."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        request_profile: RequestProfile,
        generation_policy: LLMCallPolicy,
        test_policy: LLMCallPolicy,
    ) -> None:
        self._delegate = OpenAICompatibleProvider(
            base_url=base_url,
            api_key=api_key,
            model=model,
            request_profile=request_profile,
            generation_policy=generation_policy,
            test_policy=test_policy,
            provider="OPENROUTER",
            response_parser=self._extract_text,
        )

    @property
    def _model(self) -> str:
        return self._delegate._model

    @property
    def _client(self):
        return self._delegate._client

    @property
    def _request_profile(self) -> RequestProfile:
        return self._delegate._request_profile

    def complete(
        self,
        *,
        kind: str,
        system: str,
        prompt: str,
        context: dict | None = None,
        max_tokens: int = 4096,
    ) -> str:
        return self._delegate.complete(
            kind=kind, system=system, prompt=prompt, context=context, max_tokens=max_tokens
        )

    def test_connection(self) -> None:
        self._delegate.test_connection()

    def close(self) -> None:
        self._delegate.close()

    def _extract_text(self, data: object) -> str:
        if not isinstance(data, Mapping):
            raise invalid_response_error("OPENROUTER")

        top_level_error = data.get("error")
        if isinstance(top_level_error, Mapping):
            raise _map_openrouter_error(top_level_error)

        choices = data.get("choices")
        if isinstance(choices, list) and choices and isinstance(choices[0], Mapping):
            choice = choices[0]
            if choice.get("finish_reason") == "error":
                error = choice.get("error")
                if not isinstance(error, Mapping):
                    raise invalid_response_error("OPENROUTER")
                raise _map_openrouter_error(error)

        return self._delegate._extract_text(data)


def _map_openrouter_error(error: Mapping[object, object]) -> LLMError:
    """Classify documented OpenRouter errors without retaining their messages."""
    raw_code = error.get("code")
    status = raw_code if isinstance(raw_code, int) and not isinstance(raw_code, bool) else None
    metadata = error.get("metadata")
    error_type = (
        metadata.get("error_type")
        if isinstance(metadata, Mapping)
        else None
    )
    normalized_type = error_type.casefold() if isinstance(error_type, str) else ""

    if status == 401 or normalized_type in {"authentication_error", "invalid_api_key"}:
        return LLMError(
            "OpenRouter rechazó la autenticación. Revisa o reemplaza la clave.",
            code="LLM_AUTHENTICATION_FAILED",
            provider="OPENROUTER",
            upstream_status=status,
        )
    if status == 402 or normalized_type in {
        "billing_error",
        "insufficient_credits",
        "insufficient_quota",
    }:
        return LLMError(
            "La cuota o el saldo de OpenRouter se agotó.",
            code="LLM_QUOTA_EXHAUSTED",
            provider="OPENROUTER",
            upstream_status=status,
        )
    if status == 403 or normalized_type in {"access_denied", "permission_error"}:
        return LLMError(
            "OpenRouter rechazó el acceso al modelo. Revisa permisos y disponibilidad.",
            code="LLM_ACCESS_DENIED",
            provider="OPENROUTER",
            upstream_status=status,
        )
    if status in {404, 410} or normalized_type in {
        "model_not_found",
        "model_unavailable",
    }:
        return LLMError(
            "El modelo seleccionado no está disponible en OpenRouter.",
            code="LLM_MODEL_UNAVAILABLE",
            provider="OPENROUTER",
            upstream_status=status,
        )
    if status == 408 or normalized_type in {"request_timeout", "timeout"}:
        return LLMError(
            "La solicitud a OpenRouter agotó el tiempo de espera.",
            code="LLM_TIMEOUT",
            provider="OPENROUTER",
            upstream_status=status,
            retryable=True,
        )
    if status == 429 or normalized_type == "rate_limited":
        return LLMError(
            "OpenRouter está limitando temporalmente las solicitudes.",
            code="LLM_RATE_LIMITED",
            provider="OPENROUTER",
            upstream_status=status,
            retryable=True,
        )
    if (
        (status is not None and 500 <= status <= 599)
        or normalized_type in {"provider_error", "provider_unavailable"}
    ):
        return LLMError(
            "OpenRouter o el proveedor seleccionado no están disponibles temporalmente.",
            code="LLM_PROVIDER_UNAVAILABLE",
            provider="OPENROUTER",
            upstream_status=status,
            retryable=True,
        )
    if status in {400, 422} or normalized_type in {
        "bad_request",
        "invalid_parameter",
        "unsupported_parameter",
    }:
        return LLMError(
            "OpenRouter no admite esta solicitud para el modelo seleccionado.",
            code="LLM_UNSUPPORTED_REQUEST",
            provider="OPENROUTER",
            upstream_status=status,
        )
    return LLMError(
        "OpenRouter no pudo completar la solicitud.",
        code="LLM_PROVIDER_ERROR",
        provider="OPENROUTER",
        upstream_status=status,
    )
