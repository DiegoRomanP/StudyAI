"""Application configuration loaded from environment variables.

Centralises every tunable so the rest of the codebase never reads ``os.environ``
directly (Twelve-Factor config). Values are validated once at import time.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import math
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Repository layout anchors so paths in .env can stay relative and portable.
BACKEND_DIR = Path(__file__).resolve().parents[2]
STORAGE_DIR = BACKEND_DIR / "storage"


@dataclass(frozen=True)
class LLMCallPolicy:
    """Configuration for the bounded lifetime of one provider operation."""

    connect_timeout_seconds: float
    read_timeout_seconds: float
    total_budget_seconds: float
    max_attempts: int
    max_rate_limit_retries: int

    def __post_init__(self) -> None:
        for value in (
            self.connect_timeout_seconds,
            self.read_timeout_seconds,
            self.total_budget_seconds,
        ):
            if not math.isfinite(value) or value <= 0:
                raise ValueError("Los límites temporales de LLM deben ser finitos y positivos.")
        if self.max_attempts < 1 or self.max_rate_limit_retries < 0:
            raise ValueError("Los límites de reintento de LLM no son válidos.")


class Settings(BaseSettings):
    """Strongly-typed view over the process environment.

    The defaults are chosen so the project boots and runs end-to-end with *no*
    ``.env`` file: SQLite on disk, a local Chroma directory, and the mock LLM
    (used automatically whenever ``ANTHROPIC_API_KEY`` is empty).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- LLM -----------------------------------------------------------------
    # When empty, and no verified user credential is active, the app falls back
    # to the deterministic MockLLMProvider so the MVP remains runnable offline.
    ANTHROPIC_API_KEY: str = ""
    # Defaults follow Anthropic's guidance (Opus 4.8 is the current flagship).
    # Cheaper alternatives you may set here: claude-sonnet-5, claude-haiku-4-5.
    LLM_MODEL_PLAN: str = "claude-opus-4-8"
    LLM_MODEL_QUIZ: str = "claude-haiku-4-5"
    LLM_MAX_RETRIES: int = Field(default=3, ge=1)
    LLM_MAX_RATE_LIMIT_RETRIES: int = Field(default=6, ge=0)
    # 4096-token generations on a large hosted model (NVIDIA NIM's 70B/405B
    # models, free-tier OpenRouter models under load, etc.) can legitimately
    # take well over a minute; plan generation runs as a background task, so
    # a generous timeout costs nothing and avoids spurious "generation failed"
    # results from calls that were simply still working.
    LLM_TIMEOUT_SECONDS: float = Field(default=180.0, gt=0, allow_inf_nan=False)
    # A generation may make several attempts, but no individual provider call
    # should occupy a worker indefinitely.
    LLM_TOTAL_BUDGET_SECONDS: float = Field(default=600.0, gt=0, allow_inf_nan=False)
    # Credential tests need prompt feedback rather than generation-sized waits.
    # ``MAX_RETRIES`` counts retries after the first attempt.
    LLM_TEST_CONNECT_TIMEOUT_SECONDS: float = Field(default=5.0, gt=0, allow_inf_nan=False)
    LLM_TEST_READ_TIMEOUT_SECONDS: float = Field(default=30.0, gt=0, allow_inf_nan=False)
    LLM_TEST_TOTAL_BUDGET_SECONDS: float = Field(default=45.0, gt=0, allow_inf_nan=False)
    LLM_TEST_MAX_RETRIES: int = Field(default=1, ge=0)
    LLM_TEST_MAX_RATE_LIMIT_RETRIES: int = Field(default=1, ge=0)
    # Proactive pacing between successive LLM calls within a single plan
    # generation (topic analysis, session planning, then one call per
    # session) — a free-tier RPM limit (OpenRouter's ~8 req/min, etc.) can be
    # exceeded by the pipeline's own normal call volume alone, before any
    # single call even needs to retry. Skipped entirely for MockLLMProvider so
    # local dev/tests stay instant. Raise this in `.env` for very tight tiers.
    LLM_REQUEST_PACING_SECONDS: float = Field(default=2.0, ge=0, allow_inf_nan=False)
    # Operator-provided free-tier AI for learners who have not connected their own:
    # NVIDIA first, Google once NVIDIA's quota is gone. Keys live only in the environment.
    NVIDIA_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    DEFAULT_NVIDIA_MODEL: str = "nvidia/nemotron-3-super-120b-a12b"
    DEFAULT_GEMINI_MODEL: str = "gemma-4-26b-a4b-it"
    # Free tiers get a short leash so a stalled provider hands over to the next one quickly.
    DEFAULT_AI_READ_TIMEOUT_SECONDS: float = Field(default=60.0, gt=0, allow_inf_nan=False)
    DEFAULT_AI_TOTAL_BUDGET_SECONDS: float = Field(default=120.0, gt=0, allow_inf_nan=False)
    # Ollama runs on the backend host, not in the browser. This URL is operator
    # configuration rather than a user-provided override, so it cannot turn the
    # settings API into an internal-network proxy.
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_TIMEOUT_SECONDS: float = Field(default=600.0, gt=0, allow_inf_nan=False)
    OLLAMA_TOTAL_BUDGET_SECONDS: float = Field(default=600.0, gt=0, allow_inf_nan=False)
    OLLAMA_MAX_RETRIES: int = Field(default=1, ge=1)

    # --- Persistence ---------------------------------------------------------
    DATABASE_URL: str = f"sqlite:///{(BACKEND_DIR / 'studyai.db').as_posix()}"
    CHROMA_PERSIST_DIR: str = (STORAGE_DIR / "chroma").as_posix()
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # --- Storage / uploads ---------------------------------------------------
    UPLOAD_DIR: str = (STORAGE_DIR / "uploads").as_posix()
    MAX_UPLOAD_MB: int = 25

    # --- App -----------------------------------------------------------------
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me-in-production"
    # NoDecode: pydantic-settings otherwise tries to json.loads() env values for
    # list-typed fields *before* the CSV validator below runs, so a plain
    # comma-separated ".env" value (our documented format) would crash on boot.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    # --- Study session tuning ------------------------------------------------
    # Ebbinghaus-inspired review offsets (days) used when scheduling sessions.
    REVIEW_INTERVALS_DAYS: Annotated[list[int], NoDecode] = Field(
        default_factory=lambda: [1, 3, 7, 14, 30]
    )
    SESSION_DURATION_MINUTES: int = 25

    @field_validator("CORS_ORIGINS", "REVIEW_INTERVALS_DAYS", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        """Allow list-valued settings to be provided as comma-separated strings."""
        if isinstance(value, str):
            items = [item.strip() for item in value.split(",") if item.strip()]
            return items
        return value

    @field_validator("LLM_MODEL_PLAN", "LLM_MODEL_QUIZ")
    @classmethod
    def _require_nonempty_llm_model(cls, value: str) -> str:
        model = value.strip()
        if not model:
            raise ValueError("Los modelos de Anthropic no pueden estar vacíos.")
        return model

    @property
    def has_llm_key(self) -> bool:
        return bool(self.ANTHROPIC_API_KEY.strip())

    @property
    def has_default_nvidia_key(self) -> bool:
        return bool(self.NVIDIA_API_KEY.strip())

    @property
    def has_default_gemini_key(self) -> bool:
        return bool(self.GEMINI_API_KEY.strip())

    @property
    def default_ai_policy(self) -> LLMCallPolicy:
        return LLMCallPolicy(
            connect_timeout_seconds=min(10.0, self.DEFAULT_AI_READ_TIMEOUT_SECONDS),
            read_timeout_seconds=self.DEFAULT_AI_READ_TIMEOUT_SECONDS,
            total_budget_seconds=self.DEFAULT_AI_TOTAL_BUDGET_SECONDS,
            max_attempts=2,
            max_rate_limit_retries=1,
        )

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024

    @property
    def external_generation_policy(self) -> LLMCallPolicy:
        return LLMCallPolicy(
            connect_timeout_seconds=self.LLM_TIMEOUT_SECONDS,
            read_timeout_seconds=self.LLM_TIMEOUT_SECONDS,
            total_budget_seconds=self.LLM_TOTAL_BUDGET_SECONDS,
            max_attempts=self.LLM_MAX_RETRIES,
            max_rate_limit_retries=self.LLM_MAX_RATE_LIMIT_RETRIES,
        )

    @property
    def external_test_policy(self) -> LLMCallPolicy:
        return LLMCallPolicy(
            connect_timeout_seconds=self.LLM_TEST_CONNECT_TIMEOUT_SECONDS,
            read_timeout_seconds=self.LLM_TEST_READ_TIMEOUT_SECONDS,
            total_budget_seconds=self.LLM_TEST_TOTAL_BUDGET_SECONDS,
            max_attempts=1 + self.LLM_TEST_MAX_RETRIES,
            max_rate_limit_retries=self.LLM_TEST_MAX_RATE_LIMIT_RETRIES,
        )

    @property
    def ollama_policy(self) -> LLMCallPolicy:
        return LLMCallPolicy(
            connect_timeout_seconds=self.OLLAMA_TIMEOUT_SECONDS,
            read_timeout_seconds=self.OLLAMA_TIMEOUT_SECONDS,
            total_budget_seconds=self.OLLAMA_TOTAL_BUDGET_SECONDS,
            max_attempts=self.OLLAMA_MAX_RETRIES,
            max_rate_limit_retries=0,
        )


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton so env parsing happens exactly once."""
    return Settings()
