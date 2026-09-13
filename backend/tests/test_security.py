"""Tests for app.core.security: encrypt/decrypt round trip and masking."""

import pytest

from app.core.security import SecretDecryptionError, decrypt_secret, encrypt_secret, mask_secret


def test_encrypt_decrypt_round_trip():
    plaintext = "sk-super-secret-value-123456"
    ciphertext = encrypt_secret(plaintext)

    assert ciphertext != plaintext
    assert decrypt_secret(ciphertext) == plaintext


def test_decrypt_rejects_garbage_ciphertext():
    with pytest.raises(SecretDecryptionError):
        decrypt_secret("not-a-real-fernet-token")


def test_mask_secret_hides_the_middle():
    masked = mask_secret("sk-abcdefghijklmnop9999")
    assert masked.startswith("sk-a")
    assert masked.endswith("9999")
    assert "abcdefghijklmnop" not in masked


def test_mask_secret_short_value_fully_hidden():
    assert mask_secret("short") == "•" * 5
