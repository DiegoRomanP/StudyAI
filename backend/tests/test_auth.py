"""Supabase JWT verification (asymmetric only) and just-in-time users."""

import base64
import hashlib
import hmac
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import select

import main
from app.api.deps import get_token_verifier
from app.core.auth import SupabaseTokenVerifier
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.user import User

ISSUER = "https://proj.supabase.co/auth/v1"
KEY = ec.generate_private_key(ec.SECP256R1())


class FakeJwkClient:
    def get_signing_key_from_jwt(self, token: str):
        return SimpleNamespace(key=KEY.public_key())


def make_token(*, key=KEY, **overrides) -> str:
    claims = {
        "sub": str(uuid.uuid4()), "email": f"{uuid.uuid4().hex[:8]}@example.com", "aud": "authenticated",
        "iss": ISSUER, "exp": int(time.time()) + 600,
    }
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm="ES256")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(get_settings(), "AUTH_MODE", "supabase")
    verifier = SupabaseTokenVerifier(
        jwks_url="https://x/jwks", issuer=ISSUER, audience="authenticated", jwk_client=FakeJwkClient()
    )
    main.app.dependency_overrides[get_token_verifier] = lambda: verifier
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def count_users(email: str) -> int:
    with SessionLocal() as db:
        return len(db.execute(select(User).where(User.email == email)).scalars().all())


def test_valid_token_creates_user_once(client):
    token = make_token(sub="sub-once", email="once@example.com")
    assert client.get("/goals", headers=auth(token)).status_code == 200
    assert client.get("/goals", headers=auth(token)).status_code == 200
    assert count_users("once@example.com") == 1
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.supabase_user_id == "sub-once")).scalar_one()
        assert user.email == "once@example.com"


@pytest.mark.parametrize(
    "overrides",
    [{"exp": int(time.time()) - 10}, {"aud": "other"}, {"iss": "https://evil/auth/v1"}, {"is_anonymous": True}],
    ids=["expired", "wrong_audience", "wrong_issuer", "anonymous"],
)
def test_bad_claims_401(client, overrides):
    r = client.get("/goals", headers=auth(make_token(**overrides)))
    assert r.status_code == 401 and r.json()["code"] == "AUTH_INVALID_TOKEN"


def test_bad_signature_401(client):
    other = ec.generate_private_key(ec.SECP256R1())
    r = client.get("/goals", headers=auth(make_token(key=other)))
    assert r.status_code == 401 and r.json()["code"] == "AUTH_INVALID_TOKEN"


def test_hs256_token_rejected(client):
    """Classic algorithm confusion: HS256 signed with the public key as the secret."""
    pub = KEY.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )

    def b64(data: bytes) -> bytes:
        return base64.urlsafe_b64encode(data).rstrip(b"=")

    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64(json.dumps({
        "sub": "x", "email": "h@example.com", "aud": "authenticated", "iss": ISSUER,
        "exp": int(time.time()) + 600,
    }).encode())
    sig = b64(hmac.new(pub, head + b"." + body, hashlib.sha256).digest())
    r = client.get("/goals", headers=auth((head + b"." + body + b"." + sig).decode()))
    assert r.status_code == 401 and r.json()["code"] == "AUTH_INVALID_TOKEN"


def test_missing_header_401_auth_required(client):
    r = client.get("/goals")
    assert r.status_code == 401 and r.json()["code"] == "AUTH_REQUIRED"


def test_email_of_another_sub_is_409(client):
    assert client.get("/goals", headers=auth(make_token(sub="a-1", email="dup@example.com"))).status_code == 200
    r = client.get("/goals", headers=auth(make_token(sub="a-2", email="dup@example.com")))
    assert r.status_code == 409 and r.json()["code"] == "AUTH_EMAIL_CONFLICT"


def test_concurrent_first_requests_create_one_user(client):
    token = make_token(sub="sub-race", email="race@example.com")
    with ThreadPoolExecutor(2) as pool:
        codes = list(pool.map(lambda _: client.get("/goals", headers=auth(token)).status_code, range(2)))
    assert codes == [200, 200]
    assert count_users("race@example.com") == 1


def test_demo_mode_unchanged():
    with TestClient(main.app) as c:
        assert get_settings().AUTH_MODE == "demo"
        assert c.get("/goals").status_code == 200
        assert c.get("/config").json()["auth_mode"] == "demo"
