"""Small client for discovering free text models available on OpenRouter."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

import httpx

from app.core.exceptions import LLMError


@dataclass(frozen=True)
class OpenRouterModel:
    id: str
    name: str
    context_length: int | None


class OpenRouterClient:
    def __init__(self, *, base_url: str, timeout: float) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout,
            follow_redirects=False,
        )

    def list_free_models(self) -> list[OpenRouterModel]:
        try:
            response = self._client.get(
                "/models",
                params={"output_modalities": "text", "sort": "pricing-low-to-high"},
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            raise LLMError(
                "No se pudo consultar el catálogo de modelos de OpenRouter.",
                code="LLM_PROVIDER_ERROR",
                provider="OPENROUTER",
            ) from None

        data = payload.get("data") if isinstance(payload, Mapping) else None
        if not isinstance(data, list):
            raise LLMError(
                "OpenRouter devolvió un catálogo de modelos inválido.",
                code="LLM_INVALID_RESPONSE",
                provider="OPENROUTER",
            )

        models: list[OpenRouterModel] = []
        for item in data:
            if not isinstance(item, Mapping) or not _is_free_text_model(item):
                continue
            model_id = item.get("id")
            if not isinstance(model_id, str) or not model_id:
                continue
            name = item.get("name")
            context_length = item.get("context_length")
            models.append(
                OpenRouterModel(
                    id=model_id,
                    name=name if isinstance(name, str) and name else model_id,
                    context_length=(
                        context_length
                        if isinstance(context_length, int)
                        and not isinstance(context_length, bool)
                        and context_length >= 0
                        else None
                    ),
                )
            )

        return sorted(
            {model.id: model for model in models}.values(),
            key=lambda model: model.id,
        )

    def close(self) -> None:
        self._client.close()


def _is_free_text_model(model: Mapping[object, object]) -> bool:
    architecture = model.get("architecture")
    if isinstance(architecture, Mapping):
        output_modalities = architecture.get("output_modalities")
        if isinstance(output_modalities, list) and "text" not in output_modalities:
            return False

    model_id = model.get("id")
    if isinstance(model_id, str) and model_id.endswith(":free"):
        return True

    pricing = model.get("pricing")
    if not isinstance(pricing, Mapping):
        return False
    request_price = pricing.get("request")
    return (
        _is_zero_price(pricing.get("prompt"))
        and _is_zero_price(pricing.get("completion"))
        and (request_price is None or _is_zero_price(request_price))
    )


def _is_zero_price(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return Decimal(value) == 0
    except InvalidOperation:
        return False
