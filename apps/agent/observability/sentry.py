"""Sentry SDK stub for the agent — symmetric with apps/web/lib/observability.

We don't import the real `sentry_sdk` yet to keep the agent image lean
during sandbox builds. The shim routes captures through the structured
logger so events still surface in CI / dev tail logs. Wire the real SDK
later by replacing the function bodies — call sites stay unchanged.
"""

from __future__ import annotations

import os
from typing import Any

from .logger import get_logger

_logger = get_logger("listpack.agent.observability")
_init_warning_done = False


def _warn_init_once() -> None:
    global _init_warning_done
    if _init_warning_done:
        return
    _init_warning_done = True
    if os.environ.get("SENTRY_DSN"):
        _logger.warning(
            "sentry: SENTRY_DSN set but sentry_sdk not installed — "
            "replace shim with real SDK call",
        )
    else:
        _logger.debug("sentry: SENTRY_DSN unset; logging only")


def capture_exception(exc: BaseException, **context: Any) -> None:
    _warn_init_once()
    _logger.error(
        "captureException",
        exc_info=(type(exc), exc, exc.__traceback__),
        extra=context,
    )


def capture_message(
    msg: str,
    level: str = "info",
    **context: Any,
) -> None:
    _warn_init_once()
    log_level = {"warning": "warning", "info": "info", "error": "error"}.get(level, "info")
    getattr(_logger, log_level)(f"captureMessage: {msg}", extra=context)


_current_user: dict | None = None


def set_user(user: dict | None) -> None:
    """Track the calling user; real SDK would attach to events."""
    _warn_init_once()
    global _current_user
    _current_user = user


def _peek_user() -> dict | None:
    return _current_user
