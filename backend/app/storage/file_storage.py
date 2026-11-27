"""Where uploaded files and extracted figures live: local disk (default) or S3-compatible (R2, S3).

Callers hold opaque *keys* (``users/1/documents/<uuid>.pdf``) and read a file through ``local_copy``,
so parsers keep working on a real path whichever backend is active. Same Factory + fallback idea as
``llm/``: S3 is chosen only when requested *and* configured, otherwise local with a log line.
"""

from __future__ import annotations

import contextlib
import os
import shutil
import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import ContextManager, Protocol

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class FileStorage(Protocol):
    def save(self, key: str, content: bytes) -> None: ...
    def local_copy(self, key: str) -> ContextManager[Path]: ...
    def delete(self, key: str) -> None: ...
    def delete_prefix(self, prefix: str) -> None: ...


class LocalFileStorage:
    def __init__(self, root: Path) -> None:
        self._root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        if os.path.isabs(key):  # rows written before keys existed hold the full path
            return Path(key)
        path = (self._root / key).resolve()
        if not path.is_relative_to(self._root):
            raise ValueError("Clave de archivo fuera del almacén.")
        return path

    def save(self, key: str, content: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    @contextlib.contextmanager
    def local_copy(self, key: str) -> Iterator[Path]:
        yield self._path(key)

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def delete_prefix(self, prefix: str) -> None:
        shutil.rmtree(self._path(prefix), ignore_errors=True)


class S3FileStorage:
    def __init__(
        self, *, bucket: str, endpoint_url: str, access_key_id: str, secret_access_key: str,
        region: str = "auto", client: object | None = None,
    ) -> None:
        self._bucket = bucket
        if client is None:
            import boto3  # lazy: only the SaaS extras install it

            client = boto3.client(
                "s3", endpoint_url=endpoint_url, aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key, region_name=region,
            )
        self._client = client

    def save(self, key: str, content: bytes) -> None:
        self._client.put_object(Bucket=self._bucket, Key=key, Body=content)

    @contextlib.contextmanager
    def local_copy(self, key: str) -> Iterator[Path]:
        fd, name = tempfile.mkstemp(suffix=Path(key).suffix)
        os.close(fd)
        try:
            self._client.download_file(self._bucket, key, name)
            yield Path(name)
        finally:
            Path(name).unlink(missing_ok=True)

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def delete_prefix(self, prefix: str) -> None:
        prefix = prefix.rstrip("/") + "/"
        token = None
        while True:
            kwargs = {"Bucket": self._bucket, "Prefix": prefix}
            if token:
                kwargs["ContinuationToken"] = token
            page = self._client.list_objects_v2(**kwargs)
            for item in page.get("Contents", []):
                self.delete(item["Key"])
            token = page.get("NextContinuationToken")
            if not token:
                return


def get_file_storage() -> FileStorage:
    settings = get_settings()
    if settings.STORAGE_BACKEND == "s3":
        s3 = (settings.S3_BUCKET, settings.S3_ENDPOINT_URL, settings.S3_ACCESS_KEY_ID, settings.S3_SECRET_ACCESS_KEY)
        if all(s3):
            try:
                return S3FileStorage(
                    bucket=settings.S3_BUCKET, endpoint_url=settings.S3_ENDPOINT_URL,
                    access_key_id=settings.S3_ACCESS_KEY_ID,
                    secret_access_key=settings.S3_SECRET_ACCESS_KEY, region=settings.S3_REGION,
                )
            except ImportError:
                if settings.is_saas_production:  # local disk in the container would lose every upload
                    raise RuntimeError("STORAGE_BACKEND=s3 en producción exige boto3 (requirements-saas.txt).")
                logger.warning("STORAGE_BACKEND=s3 but boto3 is not installed; using local storage.")
        else:
            logger.warning("STORAGE_BACKEND=s3 but the S3_* variables are incomplete; using local storage.")
    return LocalFileStorage(Path(settings.UPLOAD_DIR))
