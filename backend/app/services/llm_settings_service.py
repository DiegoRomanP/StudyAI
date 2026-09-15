"""Use-cases for user-configured LLM provider credentials.

Unlike ``goals``/``documents`` (routes call the repository directly), this
resource needs real business logic — encryption, single-active enforcement,
and connection testing — so it gets its own service layer.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.exceptions import ConflictError, LLMError, NotFoundError, ValidationError
from app.core.security import SecretDecryptionError, encrypt_secret, mask_secret
from app.core.config import get_settings
from app.core.url_safety import assert_safe_outbound_url
from app.llm.credential_state import is_verified, verification_fingerprint
from app.llm.factory import LLMRuntimeState, resolve_llm_provider
from app.llm.ollama_client import OllamaClient, OllamaModel
from app.models.llm_credential import LLMCredential, LLMProviderName
from app.repositories.llm_credential_repository import LLMCredentialRepository


class LLMSettingsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = LLMCredentialRepository(db)

    def list_credentials(self, user_id: int) -> list[LLMCredential]:
        return self.repo.list_for_user(user_id)

    def get_runtime(self, user_id: int) -> LLMRuntimeState:
        """Report the effective provider selection without sending an LLM request."""
        resolution = resolve_llm_provider(self.db, user_id)
        try:
            return resolution.runtime
        finally:
            resolution.provider.close()

    def upsert_credential(
        self,
        user_id: int,
        provider: LLMProviderName,
        api_key: str | None,
        base_url: str = "",
    ) -> LLMCredential:
        """Set or replace a provider API key without testing a guessed model."""
        api_key = (api_key or "").strip()
        if provider != LLMProviderName.OLLAMA and len(api_key) < 8:
            raise ValidationError("La clave de API no es válida (demasiado corta).")

        base_url = base_url.strip()
        if provider == LLMProviderName.OLLAMA and base_url:
            raise ValidationError("La URL de Ollama se configura en OLLAMA_BASE_URL del servidor.")
        if base_url:
            assert_safe_outbound_url(base_url)

        encrypted = encrypt_secret(api_key)
        preview = mask_secret(api_key)

        existing = self.repo.find_for_user_and_provider(user_id, provider)
        if existing is not None:
            replaced = self.repo.replace_credential(
                existing,
                encrypted_api_key=encrypted,
                key_preview=preview,
                base_url=base_url,
            )
            if replaced is not None:
                return replaced

        credential = LLMCredential(
            user_id=user_id,
            provider=provider,
            encrypted_api_key=encrypted,
            key_preview=preview,
            model="",
            base_url=base_url,
            config_revision=1,
        )
        try:
            return self.repo.save(credential)
        except IntegrityError:
            self.db.rollback()
            existing = self.repo.find_for_user_and_provider(user_id, provider)
            if existing is None:
                raise
            replaced = self.repo.replace_credential(
                existing,
                encrypted_api_key=encrypted,
                key_preview=preview,
                base_url=base_url,
            )
            if replaced is None:
                raise ConflictError("No se pudo reemplazar la clave. Inténtalo de nuevo.", "LLM_CONFIGURATION_CHANGED")
            return replaced

    def update_model(
        self,
        user_id: int,
        provider: LLMProviderName,
        model: str,
        base_url: str | None,
        expected_revision: int,
    ) -> LLMCredential:
        """Save a model/URL draft and invalidate prior test evidence."""
        credential = self._get_owned(user_id, provider)

        model = model.strip()
        if not model:
            raise ValidationError("Debes indicar un modelo.")

        resolved_base_url = credential.base_url if base_url is None else base_url.strip()
        if provider == LLMProviderName.OLLAMA and resolved_base_url:
            raise ValidationError("La URL de Ollama se configura en OLLAMA_BASE_URL del servidor.")
        if resolved_base_url:
            assert_safe_outbound_url(resolved_base_url)

        updated = self.repo.update_draft(
            credential,
            expected_revision=expected_revision,
            model=model,
            base_url=resolved_base_url,
        )
        if updated is None:
            raise ConflictError(
                "La configuración cambió en otra pestaña. Actualiza e inténtalo de nuevo.",
                "LLM_CONFIGURATION_CHANGED",
            )
        return updated

    def activate(
        self, user_id: int, provider: LLMProviderName, expected_revision: int
    ) -> LLMCredential:
        credential = self._get_owned(user_id, provider)
        if credential.config_revision != expected_revision:
            raise ConflictError(
                "La configuración cambió en otra pestaña. Actualiza e inténtalo de nuevo.",
                "LLM_CONFIGURATION_CHANGED",
            )
        if not is_verified(credential):
            raise ConflictError(
                "Guarda y verifica el modelo actual antes de activar este proveedor.",
                "LLM_NOT_VERIFIED",
            )
        activated = self.repo.activate_verified(
            credential,
            expected_revision=expected_revision,
            fingerprint=verification_fingerprint(credential),
        )
        if activated is None:
            raise ConflictError(
                "La configuración cambió en otra pestaña. Actualiza e inténtalo de nuevo.",
                "LLM_CONFIGURATION_CHANGED",
            )
        return activated

    def deactivate_all(self, user_id: int) -> None:
        changed = False
        for credential in self.repo.list_for_user(user_id):
            if credential.is_active:
                credential.is_active = False
                self.db.add(credential)
                changed = True
        if changed:
            self.db.commit()

    def delete_credential(self, user_id: int, provider: LLMProviderName) -> None:
        credential = self._get_owned(user_id, provider)
        self.repo.delete(credential)

    def test_credential(
        self, user_id: int, provider: LLMProviderName, expected_revision: int
    ) -> LLMCredential:
        """Test exactly the saved model/URL draft and persist matching evidence."""
        from app.llm.factory import build_provider_from_credential  # avoid import cycle

        credential = self._get_owned(user_id, provider)
        if credential.config_revision != expected_revision:
            raise ConflictError(
                "La configuración cambió en otra pestaña. Actualiza e inténtalo de nuevo.",
                "LLM_CONFIGURATION_CHANGED",
            )
        if not credential.model:
            raise ValidationError("Selecciona un modelo antes de probar la conexión.")

        # Keep a detached snapshot for the network call. The conditional write
        # below will reject it if another request changes or removes the draft.
        self.db.expunge(credential)
        self.db.rollback()

        instance = None
        try:
            instance = build_provider_from_credential(credential)
        except SecretDecryptionError as exc:
            raise ValidationError("No se pudo desencriptar la clave almacenada.") from exc
        try:
            instance.test_connection()
        except LLMError as exc:
            if exc.code == "LLM_AUTHENTICATION_FAILED":
                self.repo.revoke_verification(credential, expected_revision=expected_revision)
            raise
        finally:
            if instance is not None:
                instance.close()

        verified = self.repo.mark_verified(
            credential,
            expected_revision=expected_revision,
            fingerprint=verification_fingerprint(credential),
            verified_at=datetime.now(timezone.utc),
        )
        if verified is None:
            raise ConflictError(
                "La configuración cambió mientras se probaba. Vuelve a intentarlo.",
                "LLM_CONFIGURATION_CHANGED",
            )
        return verified

    def list_ollama_models(self, provider: LLMProviderName) -> list[OllamaModel]:
        if provider != LLMProviderName.OLLAMA:
            raise ValidationError("Solo Ollama permite descubrir modelos instalados.")
        settings = get_settings()
        client = OllamaClient(
            base_url=settings.OLLAMA_BASE_URL, timeout=settings.OLLAMA_TIMEOUT_SECONDS
        )
        try:
            return client.list_local_models()
        finally:
            client.close()

    def _get_owned(self, user_id: int, provider: LLMProviderName) -> LLMCredential:
        credential = self.repo.find_for_user_and_provider(user_id, provider)
        if credential is None:
            raise NotFoundError("No hay una clave configurada para ese proveedor.")
        return credential

    @staticmethod
    def _invalidate_verification(credential: LLMCredential) -> None:
        credential.verified_revision = None
        credential.verified_at = None
        credential.verified_fingerprint = None
        credential.is_active = False
