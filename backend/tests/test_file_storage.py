"""FileStorage: local backend, S3 backend with a fake client, and the factory fallback."""

import pytest

from app.core.config import get_settings
from app.storage import LocalFileStorage, S3FileStorage, get_file_storage


class FakeS3:
    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.calls = []

    def put_object(self, Bucket, Key, Body):
        self.calls.append(("put", Bucket, Key))
        self.objects[Key] = Body

    def download_file(self, Bucket, Key, Filename):
        self.calls.append(("download", Bucket, Key))
        with open(Filename, "wb") as fh:
            fh.write(self.objects[Key])

    def delete_object(self, Bucket, Key):
        self.calls.append(("delete", Bucket, Key))
        self.objects.pop(Key, None)

    def list_objects_v2(self, Bucket, Prefix, **_):
        return {"Contents": [{"Key": k} for k in self.objects if k.startswith(Prefix)]}


def _s3(client):
    return S3FileStorage(bucket="b", endpoint_url="http://x", access_key_id="k", secret_access_key="s", client=client)


def test_local_roundtrip_and_delete(tmp_path):
    storage = LocalFileStorage(tmp_path)
    storage.save("users/1/documents/a.md", b"hola")
    with storage.local_copy("users/1/documents/a.md") as path:
        assert path.read_bytes() == b"hola"
    storage.delete("users/1/documents/a.md")
    assert not (tmp_path / "users/1/documents/a.md").exists()


def test_local_rejects_traversal_and_accepts_legacy_absolute_keys(tmp_path):
    storage = LocalFileStorage(tmp_path / "root")
    with pytest.raises(ValueError):
        storage.save("../evil.txt", b"x")
    legacy = tmp_path / "old.md"
    legacy.write_bytes(b"old")
    with storage.local_copy(str(legacy)) as path:
        assert path.read_bytes() == b"old"


def test_local_delete_prefix(tmp_path):
    storage = LocalFileStorage(tmp_path)
    storage.save("assets/7/a.png", b"1")
    storage.delete_prefix("assets/7")
    assert not (tmp_path / "assets/7").exists()


def test_s3_uses_expected_client_calls_and_removes_temp_even_on_error():
    fake = FakeS3()
    storage = _s3(fake)
    storage.save("k/a.pdf", b"data")
    with pytest.raises(RuntimeError):
        with storage.local_copy("k/a.pdf") as path:
            assert path.read_bytes() == b"data"
            kept = path
            raise RuntimeError
    assert not kept.exists()
    storage.delete("k/a.pdf")
    assert fake.calls == [("put", "b", "k/a.pdf"), ("download", "b", "k/a.pdf"), ("delete", "b", "k/a.pdf")]


def test_s3_delete_prefix_only_removes_that_prefix():
    fake = FakeS3()
    storage = _s3(fake)
    for key in ("assets/1/a.png", "assets/1/b.png", "assets/10/c.png"):
        storage.save(key, b"x")
    storage.delete_prefix("assets/1")
    assert list(fake.objects) == ["assets/10/c.png"]


def test_factory_defaults_to_local_and_falls_back_when_s3_is_incomplete(monkeypatch):
    assert isinstance(get_file_storage(), LocalFileStorage)
    monkeypatch.setattr(get_settings(), "STORAGE_BACKEND", "s3")
    assert isinstance(get_file_storage(), LocalFileStorage)  # no S3_* variables


def test_factory_builds_s3_when_configured(monkeypatch):
    pytest.importorskip("boto3")
    settings = get_settings()
    values = dict(
        STORAGE_BACKEND="s3", S3_BUCKET="b", S3_ENDPOINT_URL="https://x.example",
        S3_ACCESS_KEY_ID="k", S3_SECRET_ACCESS_KEY="s",
    )
    for name, value in values.items():
        monkeypatch.setattr(settings, name, value)
    assert isinstance(get_file_storage(), S3FileStorage)
