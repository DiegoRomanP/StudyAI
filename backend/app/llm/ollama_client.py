"""Small client for discovering models stored in the local Ollama daemon."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.exceptions import LLMError


@dataclass(frozen=True)
class OllamaModel:
    id: str
    size_bytes: int | None
    parameter_size: str | None
    context_length: int | None


class OllamaClient:
    def __init__(self, *, base_url: str, timeout: float) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"), timeout=timeout, follow_redirects=False
        )

    def list_local_models(self) -> list[OllamaModel]:
        try:
            response = self._client.get("/api/tags")
            response.raise_for_status()
            models = response.json()["models"]
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            raise LLMError(
                "No se pudo consultar Ollama local. Comprueba que el servicio esté iniciado."
            ) from exc

        if not isinstance(models, list):
            raise LLMError("Ollama devolvió un inventario de modelos inválido.")

        discovered: list[OllamaModel] = []
        for item in models:
            if not isinstance(item, dict):
                continue
            model_id = item.get("name") or item.get("model")
            # Cloud entries are registered in Ollama but are not local models.
            if not isinstance(model_id, str) or not model_id or item.get("remote_host") or model_id.endswith(":cloud"):
                continue
            details = item.get("details") if isinstance(item.get("details"), dict) else {}
            size = item.get("size")
            discovered.append(
                OllamaModel(
                    id=model_id,
                    size_bytes=size if isinstance(size, int) else None,
                    parameter_size=details.get("parameter_size") if isinstance(details.get("parameter_size"), str) else None,
                    context_length=details.get("context_length") if isinstance(details.get("context_length"), int) else None,
                )
            )
        return sorted({model.id: model for model in discovered}.values(), key=lambda model: model.id)
