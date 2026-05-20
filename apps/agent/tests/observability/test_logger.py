"""D47 agent observability — JSON formatter + sentry shim."""

from __future__ import annotations

import json
import logging

import pytest

from observability.logger import JsonFormatter, install_json_handler, get_logger
from observability.sentry import capture_exception, capture_message, set_user, _peek_user


def _make_record(level: str, msg: str, extra: dict | None = None) -> logging.LogRecord:
    rec = logging.LogRecord(
        name="listpack.test",
        level=getattr(logging, level.upper()),
        pathname=__file__,
        lineno=1,
        msg=msg,
        args=None,
        exc_info=None,
    )
    if extra:
        for k, v in extra.items():
            setattr(rec, k, v)
    return rec


def test_json_formatter_emits_stable_keys():
    fmt = JsonFormatter()
    rec = _make_record("info", "hello world", {"run_id": "r-1"})
    line = json.loads(fmt.format(rec))

    assert line["level"] == "info"
    assert line["msg"] == "hello world"
    assert line["svc"] == "agent"
    assert line["run_id"] == "r-1"
    assert line["logger"] == "listpack.test"
    assert isinstance(line["ts"], str)
    assert line["ts"].endswith("Z")


def test_json_formatter_includes_exception_info():
    fmt = JsonFormatter()
    try:
        raise ValueError("boom")
    except ValueError:
        import sys

        rec = logging.LogRecord(
            name="t",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg="explode",
            args=None,
            exc_info=sys.exc_info(),
        )
    line = json.loads(fmt.format(rec))
    assert line["exc_type"] == "ValueError"
    assert line["exc_msg"] == "boom"
    assert "Traceback" in line["exc_trace"]


def test_json_formatter_serialises_non_json_extras_as_strings():
    fmt = JsonFormatter()
    rec = _make_record("info", "x", {"obj": object()})
    line = json.loads(fmt.format(rec))
    assert isinstance(line["obj"], str)


def test_install_json_handler_replaces_prior_handlers(caplog):
    install_json_handler("DEBUG")
    root = logging.getLogger()
    # Re-install should replace, not stack.
    install_json_handler("DEBUG")
    json_handlers = [
        h for h in root.handlers if getattr(h, "_listpack_json", False)
    ]
    assert len(json_handlers) == 1


def test_capture_exception_uses_error_logger(capsys, caplog):
    install_json_handler("DEBUG")
    try:
        raise RuntimeError("nope")
    except RuntimeError as exc:
        capture_exception(exc, run_id="r-9")

    captured = capsys.readouterr()
    line = next(
        (json.loads(l) for l in captured.err.strip().split("\n") if "captureException" in l),
        None,
    )
    assert line is not None
    assert line["msg"] == "captureException"
    assert line["run_id"] == "r-9"
    assert line["exc_type"] == "RuntimeError"


def test_capture_message_levels_route_correctly(capsys):
    install_json_handler("DEBUG")
    capture_message("test event", level="warning", section="quota")
    captured = capsys.readouterr()
    line = next(
        (json.loads(l) for l in captured.err.strip().split("\n") if "test event" in l),
        None,
    )
    assert line is not None
    assert line["level"] == "warning"
    assert line["section"] == "quota"


def test_set_user_round_trips():
    set_user({"id": "u-1", "email": "x@y.com"})
    assert _peek_user() == {"id": "u-1", "email": "x@y.com"}
    set_user(None)
    assert _peek_user() is None
