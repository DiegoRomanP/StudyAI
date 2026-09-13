"""Symmetric encryption for secrets at rest (LLM API keys).

Uses Fernet (AES128-CBC + HMAC, from the ``cryptography`` package) keyed from
``Settings.SECRET_KEY`` so no separate key-management infrastructure is needed
for this MVP. ``SECRET_KEY`` must be a real random value in production — the
placeholder default is fine for local/demo use only, but changing it after
keys have been stored makes them undecryptable (callers must treat
``SecretDecryptionError`` as "this credential no longer works", not crash).
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


class SecretDecryptionError(Exception):
    """The stored ciphertext could not be decrypted (wrong/rotated key, corruption)."""


def _fernet() -> Fernet:
    settings = get_settings()
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise SecretDecryptionError("Stored secret could not be decrypted.") from exc


def mask_secret(plaintext: str) -> str:
    """A short, non-reversible preview safe to store/display (e.g. 'sk-a••••••9f2k')."""
    if len(plaintext) <= 8:
        return "•" * len(plaintext)
    return f"{plaintext[:4]}{'•' * 6}{plaintext[-4:]}"
