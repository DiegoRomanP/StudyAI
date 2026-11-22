"""Port for local agent CLIs (Claude Code, OpenCode, Pi, Codex) used as LLM providers.

Each harness is an adapter behind the same ``LLMProvider`` port: it only knows
how to build the argv, which files the isolated working directory needs, and how
to read the CLI's JSON output. Spawning, isolation, timeouts and error mapping
live here, once.

The CLIs run on the backend host with the operator's own login (a personal
subscription or the harness's free models), so they are self-hosted only.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
from abc import ABC, abstractmethod
from collections.abc import Callable
from pathlib import Path

from app.core.config import get_settings
from app.core.exceptions import LLMError, ValidationError
from app.llm.base import LLMProvider
from app.llm.error_mapping import empty_response_error, timeout_error
from app.llm.harness.runner import CliResult, run_cli
from app.llm.ollama_client import OllamaModel
from app.llm.providers.base import ProviderDefinition, ProviderMeta
from app.llm.request_profiles import RequestProfile
from app.llm.usage import LLMUsage
from app.models.llm_credential import LLMCredential, LLMProviderName

logger = logging.getLogger(__name__)

Runner = Callable[..., CliResult]

# Leading letter/digit so a model ID can never be read as a CLI flag.
_MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,127}$")
_TEST_SYSTEM = "Reply with the single word: ok"


class HarnessAdapter(ABC):
    """What differs between agent CLIs. Everything else is shared."""

    provider: LLMProviderName
    label: str
    binary_setting: str
    # Env vars that would make the CLI bill an API key instead of the subscription.
    env_drop: tuple[str, ...] = ()

    @abstractmethod
    def argv(self, binary: str, model: str, system: str, images: list[str]) -> list[str]:
        """Arguments; the user prompt always goes on stdin.

        ``images`` are absolute paths inside the call's throwaway working directory.
        """

    def stdin(self, system: str, prompt: str, images: list[str]) -> str:
        return prompt

    def files(self, system: str) -> dict[str, str]:
        """Files written into the throwaway working directory before the call."""
        return {}

    @abstractmethod
    def parse(self, result: CliResult, model: str) -> tuple[str, LLMUsage | None]:
        """Return the reply text and usage, or raise ``LLMError``."""

    @abstractmethod
    def list_models(self, run: Callable[[list[str]], CliResult], binary: str) -> list[OllamaModel]:
        """Models this harness lets the user call."""

    def error(self, message: str, status: int | None = None) -> LLMError:
        return classify_cli_error(self.provider.value, self.label, message, status)


def classify_cli_error(provider: str, label: str, message: str, status: int | None = None) -> LLMError:
    """Map a CLI failure to a public, fixed message; the raw text only goes to the log."""
    text = message.lower()
    logger.warning("%s CLI failed (status=%s): %s", provider, status, message[:300])
    if status in (401, 403) or any(
        word in text for word in ("not logged in", "login", "unauthorized", "authenticat", "invalid api key")
    ):
        return LLMError(
            f"{label} no tiene una sesión iniciada en este equipo. Inicia sesión en la terminal y vuelve a probar.",
            code="LLM_AUTHENTICATION_FAILED", provider=provider, upstream_status=status,
        )
    if any(word in text for word in ("usage limit", "free-limit", "quota", "limit reached", "credit")):
        return LLMError(
            f"Se agotó el uso disponible de {label} (suscripción o modelos gratuitos). "
            "Espera a que se renueve o elige otro modelo.",
            code="LLM_QUOTA_EXHAUSTED", provider=provider, upstream_status=status,
        )
    if status == 429 or "rate limit" in text or "too many requests" in text:
        return LLMError(
            f"{label} está limitando las solicitudes. Inténtalo de nuevo en unos minutos.",
            code="LLM_RATE_LIMITED", provider=provider, upstream_status=status, retryable=True,
        )
    if status == 404 or ("model" in text and any(
        word in text for word in ("not found", "not supported", "unavailable", "no-route", "does not exist")
    )):
        return LLMError(
            f"{label} no permite usar ese modelo. Elige otro de la lista.",
            code="LLM_MODEL_UNAVAILABLE", provider=provider, upstream_status=status,
        )
    return LLMError(
        f"{label} no pudo completar la solicitud.",
        code="LLM_PROVIDER_ERROR", provider=provider, upstream_status=status,
    )


def json_lines(stdout: str) -> list[dict]:
    """The JSON objects of a JSONL event stream; other lines (logs, banners) are skipped."""
    events = []
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict):
            events.append(event)
    return events


def _refuse_in_saas(provider: str) -> None:
    if get_settings().is_saas:
        raise LLMError(
            "Las IA de terminal solo están disponibles en una instalación local.",
            code="LLM_UNSUPPORTED_CONFIGURATION", provider=provider,
        )


def _child_env(drop: tuple[str, ...]) -> dict[str, str]:
    # Not configuration: the child needs HOME/PATH to find its own login.
    return {key: value for key, value in os.environ.items() if key not in drop}


class CliHarnessProvider(LLMProvider):
    # The CLI applies its own subscription limits; proactive pacing only slows it down.
    requires_request_pacing = False
    # Whether the chosen model really sees images is only known when it answers.
    supports_images = True
    rich_content = True

    def __init__(
        self,
        adapter: HarnessAdapter,
        *,
        model: str,
        binary: str,
        timeout: float,
        test_timeout: float,
        runner: Runner | None = None,
    ) -> None:
        self._adapter = adapter
        self._model = model
        self._binary = binary
        self._timeout = timeout
        self._test_timeout = test_timeout
        self._runner = runner or run_cli

    def complete(
        self,
        *,
        kind: str,
        system: str,
        prompt: str,
        context: dict | None = None,
        max_tokens: int = 4096,
    ) -> str:
        # CLIs take no output-token limit: the prompt sets the size, max_tokens is ignored.
        provider = self._adapter.provider.value
        _refuse_in_saas(provider)
        timeout = self._test_timeout if kind == "test" else self._timeout
        with tempfile.TemporaryDirectory(prefix="studyai-harness-") as workdir:
            for name, content in self._adapter.files(system).items():
                Path(workdir, name).write_text(content, encoding="utf-8")
            # Copied in so the CLI only ever sees its own throwaway directory.
            images = []
            for index, source in enumerate((context or {}).get("image_paths") or []):
                target = Path(workdir, f"figura-{index + 1}.png")
                shutil.copyfile(source, target)
                # Absolute: OpenCode resolves attachments from its background service, not our cwd.
                images.append(str(target))
            try:
                result = self._runner(
                    self._adapter.argv(self._binary, self._model, system, images),
                    stdin=self._adapter.stdin(system, prompt, images),
                    timeout=timeout,
                    env=_child_env(self._adapter.env_drop),
                    cwd=workdir,
                )
            except FileNotFoundError as exc:
                raise LLMError(
                    f"No se encontró la CLI de {self._adapter.label} en el servidor. Instálala y vuelve a probar.",
                    code="LLM_PROVIDER_UNAVAILABLE", provider=provider,
                ) from exc
            except subprocess.TimeoutExpired as exc:
                raise timeout_error(provider) from exc
            except OSError as exc:  # e.g. the binary exists but is not executable
                raise LLMError(
                    f"No se pudo ejecutar la CLI de {self._adapter.label} en el servidor: {exc.strerror or exc}.",
                    code="LLM_PROVIDER_UNAVAILABLE", provider=provider,
                ) from exc
        text, usage = self._adapter.parse(result, self._model)
        if usage is not None:
            self._record_usage(usage)
        if not text.strip():
            raise empty_response_error(provider)
        return text

    def test_connection(self) -> None:
        self.complete(kind="test", system=_TEST_SYSTEM, prompt="ping", max_tokens=16)


class HarnessDefinition(ProviderDefinition):
    """Provider contract shared by every agent CLI: no key, no URL, discovered models."""

    adapter: HarnessAdapter
    _cache: tuple[float, list[OllamaModel]] | None = None

    def __init__(self, adapter: HarnessAdapter, *, default_model: str = "", common_models=()) -> None:
        self.adapter = adapter
        self.meta = ProviderMeta(
            provider=adapter.provider,
            label=adapter.label,
            default_base_url=None,
            requires_model_selection=True,
            default_model=default_model,
            common_models=tuple(common_models),
            requires_api_key=False,
            supports_model_discovery=True,
            supports_custom_base_url=False,
            allows_custom_model=True,
            key_placeholder="Usa tu sesión de la terminal",
        )
        self._profile = RequestProfile(
            identifier=f"{adapter.provider.value.lower()}-cli",
            version="v1",
            token_limit_parameter="max_tokens",
            test_max_tokens=16,
            requires_usage=False,
        )

    @property
    def binary(self) -> str:
        return getattr(get_settings(), self.adapter.binary_setting)

    def installed(self) -> bool:
        return shutil.which(self.binary) is not None

    def validate_model(self, model: str) -> None:
        super().validate_model(model)
        if not _MODEL_ID.match(model):
            raise ValidationError("El identificador del modelo no es válido.")

    def validate_base_url(self, base_url: str) -> None:
        if base_url:
            raise ValidationError(f"{self.meta.label} no usa URL: se ejecuta en este equipo.")

    def effective_base_url(self, credential: LLMCredential) -> str:
        return ""

    def request_profile(self, model: str) -> RequestProfile:
        return self._profile

    def build_provider(self, credential: LLMCredential, *, api_key: str, model: str) -> CliHarnessProvider:
        _refuse_in_saas(self.meta.provider.value)
        self.validate_base_url(credential.base_url)
        settings = get_settings()
        return CliHarnessProvider(
            self.adapter,
            model=model,
            binary=self.binary,
            timeout=settings.HARNESS_TIMEOUT_SECONDS,
            test_timeout=settings.HARNESS_TEST_TIMEOUT_SECONDS,
        )

    def list_models(self, runner: Runner | None = None) -> list[OllamaModel]:
        _refuse_in_saas(self.meta.provider.value)
        now = time.monotonic()
        if self._cache is not None and now - self._cache[0] < 60:
            return self._cache[1]
        settings = get_settings()
        runner = runner or run_cli

        def run(argv: list[str]) -> CliResult:
            with tempfile.TemporaryDirectory(prefix="studyai-harness-") as workdir:
                return runner(
                    argv, stdin="", timeout=settings.HARNESS_DISCOVERY_TIMEOUT_SECONDS,
                    env=_child_env(self.adapter.env_drop), cwd=workdir,
                )

        try:
            models = self.adapter.list_models(run, self.binary)
        except FileNotFoundError as exc:
            raise LLMError(
                f"No se encontró la CLI de {self.meta.label} en el servidor.",
                code="LLM_PROVIDER_UNAVAILABLE", provider=self.meta.provider.value,
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise timeout_error(self.meta.provider.value) from exc
        self._cache = (now, models)
        return models
