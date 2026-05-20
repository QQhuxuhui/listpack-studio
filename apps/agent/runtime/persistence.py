"""Postgres-backed AgentRun + AgentStep persistence.

Mirrors `agent_runs` + `agent_steps` Drizzle tables (apps/web/lib/db/schema.ts).
Used by the listing_pack runner to write state snapshots + per-step
records as the graph executes, so the UI can resume / replay runs.

All connection management goes through psycopg.connect(POSTGRES_URL); the
existing compliance.loader pattern keeps it lightweight (no pool here —
pool lands in D34 when concurrency matters).
"""

from __future__ import annotations

import json
import logging
import os
import uuid as _uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

try:
    from uuid_utils import uuid7  # type: ignore[import-not-found]

    def _new_id() -> str:
        return str(uuid7())
except ImportError:  # pragma: no cover — uuid_utils optional
    def _new_id() -> str:
        return str(_uuid.uuid4())


logger = logging.getLogger("listpack.runtime.persistence")


# ─── dataclasses (typed rows) ────────────────────────────────────


@dataclass
class AgentRunRecord:
    id: str
    listing_pack_id: str
    status: str
    current_step: str | None
    plan: dict | None
    state: dict | None
    cost_cap_usd: Decimal | None
    cost_spent_usd: Decimal
    started_at: datetime | None
    ended_at: datetime | None
    error: dict | None
    created_at: datetime


@dataclass
class AgentStepRecord:
    id: str
    agent_run_id: str
    step_name: str
    executor_name: str | None
    status: str
    inputs: dict | None
    outputs: dict | None
    error: dict | None
    started_at: datetime | None
    ended_at: datetime | None


# ─── connection helper ──────────────────────────────────────────


def _postgres_url() -> str:
    url = os.environ.get("POSTGRES_URL")
    if not url:
        raise RuntimeError(
            "POSTGRES_URL not set; cannot persist agent runs."
        )
    return url


# ─── writes ─────────────────────────────────────────────────────


def create_agent_run(
    *,
    listing_pack_id: str,
    cost_cap_usd: Decimal | None,
    status: str = "pending",
    plan: dict | None = None,
) -> str:
    """INSERT a row into agent_runs and return its id."""
    run_id = _new_id()
    now = datetime.now(timezone.utc)
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO agent_runs
                    (id, listing_pack_id, status, current_step, plan, state,
                     cost_cap_usd, cost_spent_usd, started_at, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    run_id,
                    listing_pack_id,
                    status,
                    None,
                    Jsonb(plan) if plan is not None else None,
                    None,
                    cost_cap_usd,
                    Decimal("0"),
                    now,
                    now,
                ),
            )
    return run_id


def update_agent_run(
    run_id: str,
    *,
    status: str | None = None,
    current_step: str | None = None,
    plan: dict | None = None,
    state: dict | None = None,
    cost_spent_usd: Decimal | None = None,
    ended_at: datetime | None = None,
    error: dict | None = None,
) -> None:
    """Apply a partial update. Only non-None fields are written."""
    sets: list[str] = []
    args: list[Any] = []

    if status is not None:
        sets.append("status = %s")
        args.append(status)
    if current_step is not None:
        sets.append("current_step = %s")
        args.append(current_step)
    if plan is not None:
        sets.append("plan = %s")
        args.append(Jsonb(plan))
    if state is not None:
        sets.append("state = %s")
        args.append(Jsonb(state))
    if cost_spent_usd is not None:
        sets.append("cost_spent_usd = %s")
        args.append(cost_spent_usd)
    if ended_at is not None:
        sets.append("ended_at = %s")
        args.append(ended_at)
    if error is not None:
        sets.append("error = %s")
        args.append(Jsonb(error))

    if not sets:
        return

    args.append(run_id)
    sql = f"UPDATE agent_runs SET {', '.join(sets)} WHERE id = %s"
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, args)


def insert_agent_step(
    *,
    agent_run_id: str,
    step_name: str,
    status: str,
    executor_name: str | None = None,
    inputs: dict | None = None,
    outputs: dict | None = None,
    error: dict | None = None,
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
) -> str:
    step_id = _new_id()
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO agent_steps
                    (id, agent_run_id, step_name, executor_name, status,
                     inputs, outputs, error, started_at, ended_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    step_id,
                    agent_run_id,
                    step_name,
                    executor_name,
                    status,
                    Jsonb(inputs) if inputs is not None else None,
                    Jsonb(outputs) if outputs is not None else None,
                    Jsonb(error) if error is not None else None,
                    started_at,
                    ended_at,
                ),
            )
    return step_id


# ─── reads ──────────────────────────────────────────────────────


def get_agent_run(run_id: str) -> AgentRunRecord | None:
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT * FROM agent_runs WHERE id = %s", (run_id,))
            row = cur.fetchone()
    if row is None:
        return None
    return AgentRunRecord(
        id=str(row["id"]),
        listing_pack_id=str(row["listing_pack_id"]),
        status=row["status"],
        current_step=row.get("current_step"),
        plan=row.get("plan"),
        state=row.get("state"),
        cost_cap_usd=row.get("cost_cap_usd"),
        cost_spent_usd=row["cost_spent_usd"],
        started_at=row.get("started_at"),
        ended_at=row.get("ended_at"),
        error=row.get("error"),
        created_at=row["created_at"],
    )


def list_agent_steps(run_id: str) -> list[AgentStepRecord]:
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM agent_steps WHERE agent_run_id = %s "
                "ORDER BY started_at NULLS LAST",
                (run_id,),
            )
            rows = cur.fetchall()
    return [
        AgentStepRecord(
            id=str(r["id"]),
            agent_run_id=str(r["agent_run_id"]),
            step_name=r["step_name"],
            executor_name=r.get("executor_name"),
            status=r["status"],
            inputs=r.get("inputs"),
            outputs=r.get("outputs"),
            error=r.get("error"),
            started_at=r.get("started_at"),
            ended_at=r.get("ended_at"),
        )
        for r in rows
    ]


# ─── state JSONB serialisation helpers ──────────────────────────


# These keys in ListingPackState hold raw image bytes that don't fit in
# JSONB cleanly. We strip them on persist (the bytes only live in memory
# during a run).
_LARGE_BYTE_KEYS = ("source_image_bytes", "scene_image_bytes")


def state_to_jsonb_safe(state: dict) -> dict:
    """Drop / summarise binary fields so the state survives JSONB writes."""
    safe: dict[str, Any] = {}
    for k, v in state.items():
        if k in _LARGE_BYTE_KEYS and isinstance(v, (bytes, bytearray)):
            safe[k] = {"_kind": "bytes_placeholder", "len": len(v)}
        elif isinstance(v, bytes):
            safe[k] = {"_kind": "bytes_placeholder", "len": len(v)}
        elif isinstance(v, Decimal):
            safe[k] = str(v)
        else:
            try:
                json.dumps(v, default=str)
                safe[k] = v
            except TypeError:
                safe[k] = str(v)
    return safe


def isoformat_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat()
