"""LLM credential entity: a user-supplied API key for one provider.

The key itself is never stored in plaintext (see ``app.core.security``); only
the ciphertext and a masked preview live in the DB. At most one credential per
user is ``is_active`` at a time — that is the one ``get_llm_provider()`` uses.
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class LLMProviderName(str, enum.Enum):
    ANTHROPIC = "ANTHROPIC"
    OPENAI = "OPENAI"
    GLM = "GLM"
    OPENROUTER = "OPENROUTER"
    NVIDIA = "NVIDIA"
    HUGGINGFACE = "HUGGINGFACE"
    OLLAMA = "OLLAMA"
    GEMINI = "GEMINI"


class LLMCredential(TimestampMixin, Base):
    __tablename__ = "llm_credentials"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_llm_credential_user_provider"),
        Index(
            "uq_llm_credential_active_user",
            "user_id",
            unique=True,
            sqlite_where=text("is_active = 1"),
            postgresql_where=text("is_active"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[LLMProviderName] = mapped_column(Enum(LLMProviderName), index=True)
    encrypted_api_key: Mapped[str] = mapped_column(Text)
    # Precomputed at write time (see app.core.security.mask_secret) so listing
    # credentials never needs to decrypt the key.
    key_preview: Mapped[str] = mapped_column(String(32), default="")
    # Empty string means no model draft has been selected yet.
    model: Mapped[str] = mapped_column(String(128), default="")
    # Empty string means "use the provider's default base URL". Lets advanced
    # users point at a regional/self-hosted OpenAI-compatible endpoint.
    base_url: Mapped[str] = mapped_column(String(512), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # A model/URL/key change invalidates evidence from prior revisions.
    config_revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    verified_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
