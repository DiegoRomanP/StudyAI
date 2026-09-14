"""LLM credential persistence."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.models.llm_credential import LLMCredential, LLMProviderName
from app.repositories.base import BaseRepository


class LLMCredentialRepository(BaseRepository[LLMCredential]):
    model = LLMCredential

    def list_for_user(self, user_id: int) -> list[LLMCredential]:
        stmt = (
            select(LLMCredential)
            .where(LLMCredential.user_id == user_id)
            .order_by(LLMCredential.provider)
        )
        return list(self.db.execute(stmt).scalars().all())

    def find_for_user_and_provider(
        self, user_id: int, provider: LLMProviderName
    ) -> LLMCredential | None:
        stmt = select(LLMCredential).where(
            LLMCredential.user_id == user_id, LLMCredential.provider == provider
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def find_active_for_user(self, user_id: int) -> LLMCredential | None:
        stmt = select(LLMCredential).where(
            LLMCredential.user_id == user_id, LLMCredential.is_active.is_(True)
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def replace_credential(
        self,
        credential: LLMCredential,
        *,
        encrypted_api_key: str,
        key_preview: str,
        base_url: str,
    ) -> LLMCredential | None:
        """Atomically replace a key and invalidate every dependent field."""
        result = self.db.execute(
            update(LLMCredential)
            .where(LLMCredential.id == credential.id, LLMCredential.user_id == credential.user_id)
            .values(
                encrypted_api_key=encrypted_api_key,
                key_preview=key_preview,
                model="",
                base_url=base_url,
                config_revision=LLMCredential.config_revision + 1,
                verified_revision=None,
                verified_at=None,
                verified_fingerprint=None,
                is_active=False,
            )
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            self.db.rollback()
            return None
        self.db.commit()
        self.db.expire_all()
        return self.find_for_user_and_provider(credential.user_id, credential.provider)

    def update_draft(
        self,
        credential: LLMCredential,
        *,
        expected_revision: int,
        model: str,
        base_url: str,
    ) -> LLMCredential | None:
        """Persist a changed draft only if it still has the expected revision."""
        if credential.model == model and credential.base_url == base_url:
            result = self.db.execute(
                update(LLMCredential)
                .where(
                    LLMCredential.id == credential.id,
                    LLMCredential.user_id == credential.user_id,
                    LLMCredential.config_revision == expected_revision,
                    LLMCredential.model == model,
                    LLMCredential.base_url == base_url,
                )
                .values(model=model)
                .execution_options(synchronize_session=False)
            )
            if result.rowcount != 1:
                self.db.rollback()
                return None
            self.db.commit()
            self.db.expire_all()
            return self.find_for_user_and_provider(credential.user_id, credential.provider)

        result = self.db.execute(
            update(LLMCredential)
            .where(
                LLMCredential.id == credential.id,
                LLMCredential.user_id == credential.user_id,
                LLMCredential.config_revision == expected_revision,
            )
            .values(
                model=model,
                base_url=base_url,
                config_revision=expected_revision + 1,
                verified_revision=None,
                verified_at=None,
                verified_fingerprint=None,
                is_active=False,
            )
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            self.db.rollback()
            return None
        self.db.commit()
        self.db.expire_all()
        return self.find_for_user_and_provider(credential.user_id, credential.provider)

    def mark_verified(
        self,
        credential: LLMCredential,
        *,
        expected_revision: int,
        fingerprint: str,
        verified_at: datetime,
    ) -> LLMCredential | None:
        """Store test evidence only when the tested draft has not changed."""
        result = self.db.execute(
            update(LLMCredential)
            .where(
                LLMCredential.id == credential.id,
                LLMCredential.user_id == credential.user_id,
                LLMCredential.config_revision == expected_revision,
            )
            .values(
                verified_revision=expected_revision,
                verified_at=verified_at,
                verified_fingerprint=fingerprint,
            )
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            self.db.rollback()
            return None
        self.db.commit()
        self.db.expire_all()
        return self.find_for_user_and_provider(credential.user_id, credential.provider)

    def revoke_verification(
        self, credential: LLMCredential, *, expected_revision: int
    ) -> bool:
        """Remove evidence only if the failed test still targets this draft."""
        result = self.db.execute(
            update(LLMCredential)
            .where(
                LLMCredential.id == credential.id,
                LLMCredential.user_id == credential.user_id,
                LLMCredential.config_revision == expected_revision,
            )
            .values(
                verified_revision=None,
                verified_at=None,
                verified_fingerprint=None,
                is_active=False,
            )
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            self.db.rollback()
            return False
        self.db.commit()
        self.db.expire_all()
        return True

    def activate_verified(
        self,
        credential: LLMCredential,
        *,
        expected_revision: int,
        fingerprint: str,
    ) -> LLMCredential | None:
        """Activate exactly the tested configuration and deactivate other providers."""
        try:
            self.db.execute(
                update(LLMCredential)
                .where(
                    LLMCredential.user_id == credential.user_id,
                    LLMCredential.id != credential.id,
                    LLMCredential.is_active.is_(True),
                )
                .values(is_active=False)
                .execution_options(synchronize_session=False)
            )
            result = self.db.execute(
                update(LLMCredential)
                .where(
                    LLMCredential.id == credential.id,
                    LLMCredential.user_id == credential.user_id,
                    LLMCredential.config_revision == expected_revision,
                    LLMCredential.verified_revision == expected_revision,
                    LLMCredential.verified_fingerprint == fingerprint,
                    LLMCredential.verified_at.is_not(None),
                )
                .values(is_active=True)
                .execution_options(synchronize_session=False)
            )
            if result.rowcount != 1:
                self.db.rollback()
                return None
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return None
        self.db.expire_all()
        return self.find_for_user_and_provider(credential.user_id, credential.provider)
