"""Regression tests for log records that may originate in external LLM clients."""

import logging

from app.core.logging import configure_logging


def test_external_llm_loggers_cannot_emit_request_or_authorization_details(caplog):
    configure_logging()

    with caplog.at_level(logging.DEBUG):
        logging.getLogger("httpx").error("Authorization: Bearer secret-log-key prompt=private")
        logging.getLogger("anthropic._base_client").exception("SDK body: secret-log-key")

    assert "secret-log-key" not in caplog.text
    assert "External LLM client event suppressed." in caplog.text
