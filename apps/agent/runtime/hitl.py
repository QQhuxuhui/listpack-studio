"""HITL — pause / cancel / fork operations on a running listing_pack agent.

PRD § 02 § 8 (Human-in-the-Loop):
- pause:   user wants to review intermediate output before continuing
- cancel:  user changed their mind / wants to stop
- fork:    branch off a completed (or failed) run with new inputs
- redo_step: re-execute a single step (v2 — needs LangGraph checkpointer)

This module is intentionally lo-fi: pause/cancel are *cooperative* — the
runner polls `_run_interrupted` before each step and breaks the loop if
the DB says the user changed the status. There's no SIGTERM, no thread
cancellation, no LangGraph interrupt() yet (that's the D34 PostgresSaver
follow-up). The trade-off: a pause won't kill an in-flight LLM call, but
the next step won't fire. For an MVP listing pack run (~30-90s end to
end) this is acceptable.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .persistence import _new_id, _postgres_url

logger = logging.getLogger("listpack.runtime.hitl")


# ─── status helpers ─────────────────────────────────────────────


# Terminal statuses cannot be resumed/paused/canceled further.
TERMINAL_STATUSES = frozenset({"completed", "failed", "canceled"})


class HITLError(Exception):
    """Raised when a HITL operation is invalid for the current run state."""


class RunNotFound(HITLError):
    pass


class InvalidStateTransition(HITLError):
    pass


def _current_status(run_id: str) -> str:
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM agent_runs WHERE id = %s", (run_id,))
            row = cur.fetchone()
    if row is None:
        raise RunNotFound(f"agent_run {run_id} not found")
    return row[0]


# ─── pause ──────────────────────────────────────────────────────


def pause_run(run_id: str) -> str:
    """Mark a run as paused. Runner will stop after the current step."""
    status = _current_status(run_id)
    if status in TERMINAL_STATUSES:
        raise InvalidStateTransition(
            f"cannot pause {run_id} (status={status}; terminal)"
        )
    if status == "paused":
        return "paused"
    if status not in ("pending", "planning", "running", "awaiting_user"):
        raise InvalidStateTransition(
            f"cannot pause {run_id} from status={status}"
        )

    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE agent_runs SET status = 'paused' WHERE id = %s",
                (run_id,),
            )
    logger.info("paused run %s (was %s)", run_id, status)
    return "paused"


def resume_run(run_id: str) -> str:
    """Flip status back to running. The caller is responsible for re-driving
    the graph (D25 v1 simply re-runs from the persisted state via a new
    `start_run` call; D34 will swap in LangGraph checkpointer + Command(resume)).
    """
    status = _current_status(run_id)
    if status != "paused":
        raise InvalidStateTransition(
            f"cannot resume {run_id} from status={status}"
        )
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE agent_runs SET status = 'running' WHERE id = %s",
                (run_id,),
            )
    logger.info("resumed run %s", run_id)
    return "running"


# ─── cancel ─────────────────────────────────────────────────────


def cancel_run(run_id: str, *, reason: str | None = None) -> str:
    """Terminal cancellation. Runner will break out at next checkpoint."""
    status = _current_status(run_id)
    if status in TERMINAL_STATUSES:
        raise InvalidStateTransition(
            f"cannot cancel {run_id} (status={status}; already terminal)"
        )

    err_blob: dict | None = None
    if reason:
        err_blob = {"type": "user_canceled", "message": reason}

    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            if err_blob:
                cur.execute(
                    """
                    UPDATE agent_runs
                       SET status = 'canceled',
                           ended_at = %s,
                           error = %s
                     WHERE id = %s
                    """,
                    (datetime.now(timezone.utc), Jsonb(err_blob), run_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE agent_runs
                       SET status = 'canceled',
                           ended_at = %s
                     WHERE id = %s
                    """,
                    (datetime.now(timezone.utc), run_id),
                )
    logger.info("canceled run %s (was %s) reason=%s", run_id, status, reason)
    return "canceled"


# ─── fork ───────────────────────────────────────────────────────


def fork_run(
    source_run_id: str,
    *,
    overrides: dict[str, Any] | None = None,
) -> str:
    """Copy an agent_run row into a new pending run.

    The new run shares listing_pack_id + plan + cost_cap_usd by default;
    callers can pass `overrides` to swap any of {plan, cost_cap_usd,
    state}. The new run starts at status='pending' so the caller can
    re-drive the graph against it.

    Steps from the source run are NOT copied — fork represents "try
    again with different inputs", not "resume mid-pipeline".
    """
    overrides = overrides or {}
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM agent_runs WHERE id = %s", (source_run_id,)
            )
            src = cur.fetchone()
            if src is None:
                raise RunNotFound(f"agent_run {source_run_id} not found")

            new_id = _new_id()
            now = datetime.now(timezone.utc)
            plan = overrides.get("plan", src.get("plan"))
            state = overrides.get("state")  # forks start with empty state by default
            cost_cap = overrides.get("cost_cap_usd", src.get("cost_cap_usd"))

            cur.execute(
                """
                INSERT INTO agent_runs
                  (id, listing_pack_id, status, current_step,
                   plan, state, cost_cap_usd, cost_spent_usd,
                   started_at, created_at)
                VALUES (%s, %s, 'pending', NULL,
                        %s, %s, %s, %s,
                        %s, %s)
                """,
                (
                    new_id,
                    str(src["listing_pack_id"]),
                    Jsonb(plan) if plan is not None else None,
                    Jsonb(state) if state is not None else None,
                    cost_cap,
                    Decimal("0"),
                    now,
                    now,
                ),
            )

    logger.info("forked run %s -> %s", source_run_id, new_id)
    return new_id


# ─── runner integration ────────────────────────────────────────


def is_run_interrupted(run_id: str) -> tuple[bool, str | None]:
    """Used by listing_pack_runner between steps to honour pause / cancel.

    Returns (True, status) if the run has been moved to paused / canceled
    by an out-of-band HITL call, else (False, None).
    """
    if not os.environ.get("POSTGRES_URL"):
        return (False, None)
    try:
        status = _current_status(run_id)
    except (RunNotFound, psycopg.Error):
        return (False, None)
    if status in ("paused", "canceled"):
        return (True, status)
    return (False, None)
