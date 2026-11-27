"""SaaS hardening: rate limits, production boot validation, no API docs, security headers."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
from app.core.config import Settings, get_settings
from app.core.exceptions import RateLimitError
from app.core.rate_limit import SlidingWindowLimiter, limiter
from app.storage import file_storage


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(autouse=True)
def _fresh_limiter():
    limiter.clear()
    yield
    limiter.clear()


@pytest.fixture
def saas_limited(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "DEPLOYMENT_MODE", "saas")
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)


# --- limiter ------------------------------------------------------------------


def test_limiter_refuses_the_n_plus_one_hit_and_says_when_to_retry():
    now = [1000.0]
    lim = SlidingWindowLimiter(clock=lambda: now[0])
    for _ in range(3):
        lim.hit("b", "u", limit=3, window_seconds=60)
    now[0] += 20
    with pytest.raises(RateLimitError) as exc:
        lim.hit("b", "u", limit=3, window_seconds=60)
    assert exc.value.retry_after_seconds == 40
    lim.hit("b", "other", limit=3, window_seconds=60)  # keys are independent


def test_limiter_window_slides():
    now = [0.0]
    lim = SlidingWindowLimiter(clock=lambda: now[0])
    lim.hit("b", "u", limit=1, window_seconds=10)
    now[0] = 10.0
    lim.hit("b", "u", limit=1, window_seconds=10)  # the first hit left the window


def test_limiter_forgets_idle_keys():
    now = [0.0]
    lim = SlidingWindowLimiter(clock=lambda: now[0])
    for i in range(100):
        lim.hit("b", f"ip:{i}", limit=1, window_seconds=10)
    now[0] = 100.0
    lim.hit("b", "fresh", limit=1, window_seconds=10)
    assert list(lim._hits) == [("b", "fresh")]


def test_eleventh_generation_in_an_hour_is_429_with_retry_after(client, saas_limited):
    for _ in range(10):
        assert client.post("/plans/generate", json={}).status_code == 422  # counted, then body rejected
    response = client.post("/plans/generate", json={})
    assert response.status_code == 429
    assert response.json()["code"] == "RATE_LIMITED"
    assert 0 < int(response.headers["Retry-After"]) <= 3600


def test_self_hosted_is_never_limited(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "RATE_LIMIT_ENABLED", True)
    for _ in range(12):
        assert client.post("/plans/generate", json={}).status_code == 422


# --- production boot validation ------------------------------------------------

_PRODUCTION_OK = dict(
    DEPLOYMENT_MODE="saas", APP_ENV="production", AUTH_MODE="supabase",
    SUPABASE_URL="https://x.supabase.co", SUPABASE_JWKS_URL="https://x.supabase.co/auth/v1/.well-known/jwks.json",
    PAYMENT_GATEWAY="mercadopago", MP_ACCESS_TOKEN="tok", MP_WEBHOOK_SECRET="sec",
    STORAGE_BACKEND="s3", S3_ENDPOINT_URL="https://r2.example", S3_BUCKET="b",
    S3_ACCESS_KEY_ID="k", S3_SECRET_ACCESS_KEY="s",
    SECRET_KEY="a-long-random-secret", CORS_ORIGINS=["https://studyinflow.app"],
)


def test_complete_production_config_boots():
    Settings(_env_file=None, **_PRODUCTION_OK)


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"PAYMENT_GATEWAY": "fake"}, "PAYMENT_GATEWAY=fake"),
        ({"MP_ACCESS_TOKEN": ""}, "MP_ACCESS_TOKEN"),
        ({"MP_WEBHOOK_SECRET": ""}, "MP_WEBHOOK_SECRET"),
        ({"AUTH_MODE": "demo"}, "AUTH_MODE=supabase"),
        ({"SUPABASE_URL": ""}, "SUPABASE_URL"),
        ({"SUPABASE_JWKS_URL": ""}, "SUPABASE_JWKS_URL"),
        ({"STORAGE_BACKEND": "local"}, "STORAGE_BACKEND"),
        ({"S3_BUCKET": ""}, "S3_BUCKET"),
        ({"SECRET_KEY": "change-me-in-production"}, "SECRET_KEY"),
        ({"CORS_ORIGINS": ["*"]}, "CORS_ORIGINS"),
        ({"CORS_ORIGINS": ["http://localhost:5173"]}, "CORS_ORIGINS"),
    ],
)
def test_incomplete_production_config_refuses_to_boot(override, message):
    with pytest.raises(ValueError, match=message):
        Settings(_env_file=None, **{**_PRODUCTION_OK, **override})


def test_boot_error_does_not_echo_secrets():
    with pytest.raises(ValueError) as exc:
        Settings(_env_file=None, **{**_PRODUCTION_OK, "PAYMENT_GATEWAY": "fake", "MP_ACCESS_TOKEN": "APP_USR-leak"})
    assert "APP_USR-leak" not in str(exc.value) and "input_value" not in str(exc.value)


def test_outside_production_the_demo_defaults_still_boot():
    bad = dict(PAYMENT_GATEWAY="fake", STORAGE_BACKEND="s3", SECRET_KEY="change-me-in-production", CORS_ORIGINS=["*"])
    Settings(_env_file=None, **bad)  # self_hosted demo
    Settings(_env_file=None, DEPLOYMENT_MODE="saas", AUTH_MODE="supabase", APP_ENV="development", **bad)


def test_storage_never_falls_back_to_local_in_saas_production(monkeypatch):
    settings = get_settings()
    for name, value in dict(
        DEPLOYMENT_MODE="saas", APP_ENV="production", STORAGE_BACKEND="s3", S3_BUCKET="b",
        S3_ENDPOINT_URL="https://r2.example", S3_ACCESS_KEY_ID="k", S3_SECRET_ACCESS_KEY="s",
    ).items():
        monkeypatch.setattr(settings, name, value)

    def no_boto3(**_):
        raise ImportError

    monkeypatch.setattr(file_storage, "S3FileStorage", no_boto3)
    with pytest.raises(RuntimeError, match="boto3"):
        file_storage.get_file_storage()


# --- docs and headers ----------------------------------------------------------


def test_api_docs_are_hidden_in_saas_production(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "DEPLOYMENT_MODE", "saas")
    monkeypatch.setattr(settings, "APP_ENV", "production")
    prod = TestClient(main.create_app())
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert prod.get(path).status_code == 404
    health = prod.get("/health")
    assert health.headers["Strict-Transport-Security"].startswith("max-age=")


def test_dev_keeps_docs_and_sends_basic_security_headers(client):
    assert client.get("/docs").status_code == 200
    health = client.get("/health")
    assert health.headers["X-Content-Type-Options"] == "nosniff"
    assert health.headers["X-Frame-Options"] == "DENY"
    assert "Strict-Transport-Security" not in health.headers
