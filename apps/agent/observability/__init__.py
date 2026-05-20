"""Agent observability — structured logging + Sentry stub.

Same surface area as apps/web/lib/observability so a future migration
(e.g. dropping in real Sentry SDK + OTel) is symmetric across stacks.
"""

from .langfuse_handler import make_langfuse_callback
from .logger import get_logger, install_json_handler
from .sentry import (
    capture_exception,
    capture_message,
    init_sentry,
    set_user,
)

__all__ = [
    "capture_exception",
    "capture_message",
    "get_logger",
    "init_sentry",
    "install_json_handler",
    "make_langfuse_callback",
    "set_user",
]
