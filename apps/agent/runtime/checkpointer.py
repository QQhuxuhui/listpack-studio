"""LangGraph PostgresSaver wiring (D57).

Native checkpointer replaces the previous "compile-without-saver +
manually write agent_runs" pattern. With a saver in place:

  - every node's state delta is persisted under
    `(thread_id, checkpoint_id)` automatically
  - `graph.get_state(config)` returns the latest checkpoint
  - `graph.update_state(config, values)` lets HITL endpoints edit
    state out of band (vs our D25 cooperative DB-poll pause)
  - `graph.astream(Command(resume=value), config)` replays from a
    NodeInterrupt — true fine-grained interrupt vs full re-run

We keep the existing `agent_runs` + `agent_steps` writes for UI /
observability: those tables surface in /dashboard/runs/{id} and tools
like Sentry-mode error queries, and decoupling them from the
checkpointer means schema migrations don't blast user-facing data.

Env:
  POSTGRES_URL  — shared with the rest of the agent
  LANGGRAPH_CHECKPOINTER=postgres  — opt-in flag (default 'memory' so
    legacy tests + dev without a DB keep working)

The checkpointer is built lazily + cached so the underlying connection
pool reuses across runs (PostgresSaver opens 10 connections by default).
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("listpack.runtime.checkpointer")

_saver_cache: Any | None = None


def get_checkpointer() -> Any | None:
    """Return a PostgresSaver instance (cached), or None when the
    checkpointer is disabled (LANGGRAPH_CHECKPOINTER unset / 'memory'
    / POSTGRES_URL missing).

    Returning None tells `graph.compile()` to use the in-memory default
    MemorySaver, which is what every test relies on today.
    """
    global _saver_cache
    if _saver_cache is not None:
        return _saver_cache

    mode = (os.environ.get("LANGGRAPH_CHECKPOINTER") or "memory").lower()
    if mode != "postgres":
        return None

    url = os.environ.get("POSTGRES_URL")
    if not url:
        logger.warning(
            "LANGGRAPH_CHECKPOINTER=postgres set but POSTGRES_URL unset; "
            "falling back to in-memory checkpointer"
        )
        return None

    try:
        from langgraph.checkpoint.postgres import PostgresSaver
    except ImportError:
        logger.warning(
            "langgraph-checkpoint-postgres not installed; falling back to memory"
        )
        return None

    try:
        # PostgresSaver.from_conn_string returns a context manager in
        # some versions; we use the persistent-connection constructor so
        # the saver shares the agent's existing connection lifecycle.
        saver_cm = PostgresSaver.from_conn_string(url)
        saver = saver_cm.__enter__()
        # Run the one-time migration that creates LangGraph's tables.
        # Idempotent — safe to re-run after restarts.
        saver.setup()
        _saver_cache = saver
        logger.info("LangGraph PostgresSaver initialised")
        return saver
    except Exception as exc:  # noqa: BLE001
        logger.exception("PostgresSaver init failed: %s — falling back to memory", exc)
        return None


def reset_checkpointer_cache() -> None:
    """Test helper — drop the cached saver so re-init picks up env tweaks."""
    global _saver_cache
    _saver_cache = None
