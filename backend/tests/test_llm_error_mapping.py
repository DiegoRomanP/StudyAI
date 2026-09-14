"""Regression coverage for safe, stable upstream LLM failure classification."""

import httpx
import pytest
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime

from app.llm.error_mapping import map_http_error, map_sdk_error, map_transport_error


def _response(
    status: int, payload: object | None = None, headers: dict[str, str] | None = None
) -> httpx.Response:
    return (
        httpx.Response(status, json=payload, headers=headers)
        if payload is not None
        else httpx.Response(status, headers=headers)
    )


def test_authentication_error_does_not_expose_the_provider_body():
    error = map_http_error(
        "NVIDIA",
        _response(401, {"error": {"message": "key secret-test-key was rejected"}}),
    )

    assert error.code == "LLM_AUTHENTICATION_FAILED"
    assert error.provider == "NVIDIA"
    assert error.upstream_status == 401
    assert error.retryable is False
    assert "secret-test-key" not in str(error)


def test_access_quota_and_rate_limit_have_distinct_actions():
    access = map_http_error("NVIDIA", _response(403))
    quota = map_http_error(
        "OPENAI", _response(429, {"error": {"code": "insufficient_quota"}})
    )
    rate_limited = map_http_error("OPENAI", _response(429, headers={"retry-after": "12"}))

    assert (access.code, access.retryable) == ("LLM_ACCESS_DENIED", False)
    assert (quota.code, quota.retryable) == ("LLM_QUOTA_EXHAUSTED", False)
    assert (rate_limited.code, rate_limited.retryable, rate_limited.retry_after_seconds) == (
        "LLM_RATE_LIMITED",
        True,
        12.0,
    )


def test_missing_model_and_ambiguous_endpoint_are_distinguished():
    model = map_http_error(
        "OPENAI", _response(404, {"error": {"code": "model_not_found"}})
    )
    endpoint = map_http_error("OPENAI", _response(404))

    assert model.code == "LLM_MODEL_UNAVAILABLE"
    assert endpoint.code == "LLM_ENDPOINT_OR_MODEL_UNAVAILABLE"


def test_server_errors_take_priority_over_untrusted_structured_codes():
    error = map_http_error(
        "OPENAI", _response(503, {"error": {"code": "invalid_api_key"}})
    )

    assert (error.code, error.retryable) == ("LLM_PROVIDER_UNAVAILABLE", True)


def test_timeout_and_connection_failures_are_retryable_without_error_text():
    timeout = map_transport_error("OPENAI", httpx.ReadTimeout("private detail"))
    connection = map_transport_error("OPENAI", httpx.ConnectError("private detail"))

    assert (timeout.code, timeout.retryable) == ("LLM_TIMEOUT", True)
    assert (connection.code, connection.retryable) == ("LLM_CONNECTION_FAILED", True)
    assert "private detail" not in str(timeout)


def test_non_finite_retry_after_is_discarded():
    error = map_http_error("OPENAI", _response(429, headers={"retry-after": "NaN"}))

    assert error.retry_after_seconds is None


def test_http_date_retry_after_is_converted_to_a_wait(monkeypatch):
    now = datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc)

    class FrozenDateTime:
        @classmethod
        def now(cls, tz):
            assert tz is timezone.utc
            return now

    monkeypatch.setattr("app.llm.error_mapping.datetime", FrozenDateTime)
    error = map_http_error(
        "OPENAI",
        _response(
            429,
            headers={"retry-after": format_datetime(now + timedelta(seconds=30), usegmt=True)},
        ),
    )

    assert error.retry_after_seconds == 30.0


def test_sdk_rate_limit_preserves_retry_after():
    class RateLimitError(Exception):
        status_code = 429
        body = {"error": {"code": "rate_limit_error"}}
        response = _response(429, headers={"retry-after": "20"})

    error = map_sdk_error("ANTHROPIC", RateLimitError())

    assert (error.code, error.retry_after_seconds) == ("LLM_RATE_LIMITED", 20.0)


def test_explicit_statuses_win_over_contradictory_provider_codes():
    quota = map_http_error("OPENAI", _response(402, {"error": {"code": "invalid_api_key"}}))
    access = map_http_error("OPENAI", _response(403, {"error": {"code": "insufficient_quota"}}))
    unavailable = map_http_error("OPENAI", _response(503, {"error": {"code": "invalid_api_key"}}))

    assert quota.code == "LLM_QUOTA_EXHAUSTED"
    assert access.code == "LLM_QUOTA_EXHAUSTED"
    assert unavailable.code == "LLM_PROVIDER_UNAVAILABLE"


@pytest.mark.parametrize("status", [400, 403])
def test_known_quota_codes_are_classified_outside_429(status):
    error = map_http_error(
        "OPENAI", _response(status, {"error": {"code": "insufficient_quota"}})
    )

    assert (error.code, error.retryable) == ("LLM_QUOTA_EXHAUSTED", False)


def test_provider_rules_do_not_trust_openai_codes_from_unknown_proxies():
    error = map_http_error("UNKNOWN_PROXY", _response(400, {"error": {"code": "invalid_api_key"}}))

    assert error.code == "LLM_PROVIDER_ERROR"


def test_410_model_and_unsupported_parameter_have_specific_codes():
    model = map_http_error("OPENAI", _response(410, {"error": {"code": "model_decommissioned"}}))
    unsupported = map_http_error("OPENAI", _response(400, {"error": {"code": "unsupported_parameter"}}))

    assert model.code == "LLM_MODEL_UNAVAILABLE"
    assert unsupported.code == "LLM_UNSUPPORTED_REQUEST"


def test_structured_parameter_rejections_are_unsupported_requests_without_authentication():
    max_tokens = map_http_error(
        "OPENAI",
        _response(400, {"error": {"code": "invalid_parameter", "param": "max_tokens"}}),
    )
    max_completion_tokens = map_http_error(
        "OPENAI",
        _response(
            422,
            {
                "error": {
                    "code": "bad_request",
                    "type": "unsupported_parameter",
                    "param": "max_completion_tokens",
                }
            },
        ),
    )

    assert (max_tokens.code, max_tokens.retryable) == ("LLM_UNSUPPORTED_REQUEST", False)
    assert (max_completion_tokens.code, max_completion_tokens.retryable) == (
        "LLM_UNSUPPORTED_REQUEST",
        False,
    )


def test_unknown_structured_parameter_is_not_classified_as_unsupported_request():
    error = map_http_error(
        "OPENAI",
        _response(422, {"error": {"code": "bad_request", "param": "temperature"}}),
    )

    assert error.code == "LLM_PROVIDER_ERROR"


def test_non_retryable_server_status_is_not_advertised_as_retryable():
    error = map_http_error("OPENAI", _response(501))

    assert (error.code, error.retryable) == ("LLM_PROVIDER_UNAVAILABLE", False)
