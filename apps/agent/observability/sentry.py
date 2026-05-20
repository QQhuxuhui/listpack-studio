"""Real Sentry SDK wrapper — replaces the D47 shim.

Initialised once at process boot via `init_sentry()` (called by
server.py before FastAPI starts). The capture / set_user functions keep
the D47 call-site API so prior code keeps working.

SENTRY_DSN unset → no-op + structured logger fallback so dev / CI still
see the events without a Sentry account.
"""

from __future__ import annotations

import os
from typing import Any

import sentry_sdk

from .logger import get_logger

_logger = get_logger("listpack.agent.observability")
_initialised = False


def init_sentry() -> bool:
    """Initialise Sentry. Idempotent. Returns True when actually wired."""
    global _initialised
    if _initialised:
        return True
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        _logger.debug("sentry: SENTRY_DSN unset; logging only")
        return False

    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get(
            "SENTRY_ENVIRONMENT", os.environ.get("APP_ENV", "production")
        ),
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        # Sentry's FastAPI integration auto-wraps request handlers; opt
        # into PII only when explicitly enabled.
        send_default_pii=os.environ.get("SENTRY_SEND_PII") == "1",
    )
    _initialised = True
    _logger.info("sentry initialised", extra={"environment": os.environ.get("SENTRY_ENVIRONMENT")})
    return True


def _sentry_enabled() -> bool:
    return bool(os.environ.get("SENTRY_DSN"))


def capture_exception(exc: BaseException, **context: Any) -> None:
    if not _sentry_enabled():
        _logger.error(
            "captureException",
            exc_info=(type(exc), exc, exc.__traceback__),
            extra=context,
        )
        return
    with sentry_sdk.push_scope() as scope:
        for k, v in context.items():
            scope.set_extra(k, v)
        sentry_sdk.capture_exception(exc)


def capture_message(msg: str, level: str = "info", **context: Any) -> None:
    if not _sentry_enabled():
        log_level = {"warning": "warning", "info": "info", "error": "error"}.get(level, "info")
        getattr(_logger, log_level)(f"captureMessage: {msg}", extra=context)
        return
    with sentry_sdk.push_scope() as scope:
        for k, v in context.items():
            scope.set_extra(k, v)
        sentry_sdk.capture_message(msg, level=level)


_current_user: dict | None = None


def set_user(user: dict | None) -> None:
    global _current_user
    _current_user = user
    if _sentry_enabled():
        sentry_sdk.set_user(user)


def _peek_user() -> dict | None:
    return _current_user
