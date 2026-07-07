"""Application configuration loaded from environment variables.

Centralises every tunable so the rest of the codebase never reads ``os.environ``
directly (Twelve-Factor config). Values are validated once at import time.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repository layout anchors so paths in .env can stay relative and portable.
BACKEND_DIR = Path(__file__).resolve().parents[2]
STORAGE_DIR = BACKEND_DIR / "storage"


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
    # When empty, the app falls back to the deterministic MockLLMProvider so the
    # MVP is fully runnable without spending tokens or holding a key.
    ANTHROPIC_API_KEY: str = ""
    # Defaults follow Anthropic's guidance (Opus 4.8 is the current flagship).
    # Cheaper alternatives you may set here: claude-sonnet-5, claude-haiku-4-5.
    LLM_MODEL_PLAN: str = "claude-opus-4-8"
    LLM_MODEL_QUIZ: str = "claude-haiku-4-5"
    LLM_MAX_RETRIES: int = 3
    LLM_TIMEOUT_SECONDS: float = 60.0

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
    CORS_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    # --- Study session tuning ------------------------------------------------
    # Ebbinghaus-inspired review offsets (days) used when scheduling sessions.
    REVIEW_INTERVALS_DAYS: list[int] = Field(default_factory=lambda: [1, 3, 7, 14, 30])
    SESSION_DURATION_MINUTES: int = 25

    @field_validator("CORS_ORIGINS", "REVIEW_INTERVALS_DAYS", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        """Allow list-valued settings to be provided as comma-separated strings."""
        if isinstance(value, str):
            items = [item.strip() for item in value.split(",") if item.strip()]
            return items
        return value

    @property
    def has_llm_key(self) -> bool:
        return bool(self.ANTHROPIC_API_KEY.strip())

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton so env parsing happens exactly once."""
    return Settings()
