"""Unit tests for assert_safe_outbound_url — the SSRF guard for user-supplied
base_url overrides on LLM credentials.

DNS resolution is monkeypatched throughout so these stay fast, deterministic,
and offline (no real network/DNS dependency), matching the rest of the suite.
"""

import socket

import pytest

from app.core.exceptions import ValidationError
from app.core.url_safety import assert_safe_outbound_url


def _fake_resolving_to(ip: str):
    def _getaddrinfo(host, port):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]
    return _getaddrinfo


def test_rejects_non_http_scheme():
    with pytest.raises(ValidationError):
        assert_safe_outbound_url("ftp://example.com")


def test_rejects_embedded_userinfo():
    with pytest.raises(ValidationError):
        assert_safe_outbound_url("https://user:pass@example.com")


def test_rejects_loopback(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_resolving_to("127.0.0.1"))
    with pytest.raises(ValidationError):
        assert_safe_outbound_url("http://localhost")


def test_rejects_cloud_metadata_address(monkeypatch):
    # 169.254.169.254 is the AWS/GCP/Azure instance-metadata IP.
    monkeypatch.setattr(socket, "getaddrinfo", _fake_resolving_to("169.254.169.254"))
    with pytest.raises(ValidationError):
        assert_safe_outbound_url("http://metadata.internal")


def test_rejects_private_rfc1918(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_resolving_to("10.0.0.5"))
    with pytest.raises(ValidationError):
        assert_safe_outbound_url("http://internal-service")


def test_rejects_unspecified_address(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_resolving_to("0.0.0.0"))
    with pytest.raises(ValidationError):
        assert_safe_outbound_url("http://zero-address")


def test_rejects_unresolvable_host(monkeypatch):
    def _raise(host, port):
        raise socket.gaierror("nope")

    monkeypatch.setattr(socket, "getaddrinfo", _raise)
    with pytest.raises(ValidationError):
        assert_safe_outbound_url("https://this-host-does-not-exist.invalid")


def test_allows_public_address(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_resolving_to("8.8.8.8"))
    assert_safe_outbound_url("https://api.example.com/v1")  # must not raise
