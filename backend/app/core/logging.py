"""Minimal, dependency-free logging setup."""

from __future__ import annotations

import logging
import re

_SAFE_MODEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")
_EXTERNAL_LLM_LOGGERS = ("anthropic", "httpcore", "httpx")
_record_factory_installed = False


def safe_model_identifier(model: object) -> str:
    """Return a model identifier only when it is safe to put in a log."""
    return model if isinstance(model, str) and _SAFE_MODEL_RE.fullmatch(model) else "<invalid>"


def _install_external_log_sanitizer() -> None:
    """Keep SDK and transport records from bypassing application log policy."""
    global _record_factory_installed
    if _record_factory_installed:
        return

    previous_factory = logging.getLogRecordFactory()

    def safe_record_factory(*args, **kwargs):
        record = previous_factory(*args, **kwargs)
        if record.name in _EXTERNAL_LLM_LOGGERS or record.name.startswith(
            tuple(f"{name}." for name in _EXTERNAL_LLM_LOGGERS)
        ):
            record.msg = "External LLM client event suppressed."
            record.args = ()
            record.exc_info = None
            record.exc_text = None
        return record

    logging.setLogRecordFactory(safe_record_factory)
    _record_factory_installed = True


def configure_logging(level: str = "INFO") -> None:
    _install_external_log_sanitizer()
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
