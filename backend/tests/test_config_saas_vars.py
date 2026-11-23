from app.core.config import Settings


def test_defaults_are_self_hosted_demo(monkeypatch):
    for k in ("DEPLOYMENT_MODE", "AUTH_MODE", "STORAGE_BACKEND", "PAYMENT_GATEWAY", "APP_ENV"):
        monkeypatch.delenv(k, raising=False)
    s = Settings(_env_file=None)
    assert (s.DEPLOYMENT_MODE, s.AUTH_MODE, s.STORAGE_BACKEND, s.PAYMENT_GATEWAY) == (
        "self_hosted", "demo", "local", "fake",
    )
    assert s.APP_ENV == "development" and s.S3_REGION == "auto"
    assert not (s.SUPABASE_URL or s.S3_BUCKET or s.MP_ACCESS_TOKEN or s.MP_WEBHOOK_SECRET)
    assert s.PUBLIC_APP_URL == "http://localhost:5173" and s.PUBLIC_API_URL == "http://localhost:8001"
