"""JSON-line logging for the agent service.

Production / CI: every log record becomes a single JSON line on stderr,
parseable by Vector / Promtail / Datadog Agent.

Dev: stock logging.Formatter (timestamp + name + level + msg) is left in
place when LOG_FORMAT=text. The runtime opts in by calling
`install_json_handler()` once at server startup.

Why not loguru / structlog: keeping the dependency surface tight. Stdlib
`logging` is enough for now — we standardise the *shape*, not the SDK.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from typing import Any


SERVICE = "agent"


class JsonFormatter(logging.Formatter):
    """Render LogRecord as a JSON line with stable keys."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003 — stdlib API
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
            + f".{int(record.msecs):03d}Z",
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
            "svc": SERVICE,
        }
        # Logger.bind-style: extras passed via `extra={...}` land on the record.
        for k, v in record.__dict__.items():
            if k in _BUILTIN_RECORD_FIELDS:
                continue
            try:
                json.dumps(v, default=str)
                payload[k] = v
            except TypeError:
                payload[k] = str(v)

        if record.exc_info:
            payload["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
            payload["exc_msg"] = str(record.exc_info[1]) if record.exc_info[1] else None
            payload["exc_trace"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


# Fields LogRecord populates that we DON'T want re-emitted under their raw names.
_BUILTIN_RECORD_FIELDS = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message", "taskName", "asctime",
}


def install_json_handler(level: str | None = None) -> None:
    """Replace root handlers with one JSON-line handler on stderr.

    Idempotent: removes prior handlers we installed (so reload doesn't
    duplicate). Test harnesses can call this once per session.
    """
    log_level = (level or os.environ.get("LOG_LEVEL", "info")).upper()
    root = logging.getLogger()
    # Remove existing handlers but keep ours marked so we can identify them.
    for h in list(root.handlers):
        if getattr(h, "_listpack_json", False):
            root.removeHandler(h)
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonFormatter())
    handler._listpack_json = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(log_level)


def get_logger(name: str | None = None) -> logging.Logger:
    """Thin wrapper around logging.getLogger so call sites can swap
    libraries (structlog / loguru) later without grepping the codebase."""
    return logging.getLogger(name or "listpack.agent")
