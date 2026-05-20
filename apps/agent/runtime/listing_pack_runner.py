"""End-to-end listing_pack runner: graph.astream → SSE + Postgres persistence.

This is the glue between the LangGraph compiled in `graphs.listing_pack`
and the FastAPI SSE endpoint. The runner:

1. INSERTs an `agent_runs` row with status=pending
2. async-iterates `graph.astream(initial, stream_mode="updates")`
3. For each update:
   - INSERTs an `agent_steps` row (one per node execution)
   - UPDATEs the `agent_runs` row with the latest state JSONB + cost
   - YIELDs an SSE event dict (`{event, data}`) the FastAPI endpoint
     forwards to the client
4. On terminal node, marks the run completed/failed and yields run.completed

The runner is decoupled from FastAPI so unit tests can iterate the
async generator directly.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, AsyncIterator, Callable

from graphs.listing_pack import (
    ListingPackInput,
    ListingPackStatus,
    build_graph,
)
from graphs.listing_pack.nodes import Services
from graphs.listing_pack.state import make_initial_state

from .hitl import is_run_interrupted
from .persistence import (
    create_agent_run,
    insert_agent_step,
    isoformat_utc,
    state_to_jsonb_safe,
    update_agent_run,
)

logger = logging.getLogger("listpack.runtime.listing_pack_runner")


# Default persistence functions; tests pass no-op stubs.
_DEFAULT_PERSIST_CREATE = create_agent_run
_DEFAULT_PERSIST_UPDATE = update_agent_run
_DEFAULT_PERSIST_STEP = insert_agent_step


def _sse(event: str, data: dict) -> dict:
    """Format an SSE frame as sse-starlette expects."""
    return {"event": event, "data": json.dumps(data, default=str)}


async def run_listing_pack_streamed(
    services: Services,
    *,
    input_: ListingPackInput,
    listing_pack_id: str,
    persist: bool = True,
    persist_create: Callable = _DEFAULT_PERSIST_CREATE,
    persist_update: Callable = _DEFAULT_PERSIST_UPDATE,
    persist_step: Callable = _DEFAULT_PERSIST_STEP,
    interrupt_checker: Callable[[str], tuple[bool, str | None]] = is_run_interrupted,
) -> AsyncIterator[dict]:
    """Run the graph; yield SSE events; persist to Postgres along the way.

    Yields:
        - {event: 'run.started', data: {run_id, target_platforms}}
        - {event: 'step.completed', data: {step, status, ...}} per node
        - {event: 'run.completed' | 'run.failed', data: {...}}

    Args:
        services: dependency bag for the graph (router, executor, ...).
        input_: caller-supplied inputs (image bytes, platforms, etc.).
        listing_pack_id: FK to listing_packs row owning this run.
        persist: when False (tests), skip all DB calls; run_id is a synthetic uuid.
    """
    cost_cap = Decimal(input_.get("cost_cap_usd") or "0.50")

    if persist:
        run_id = persist_create(
            listing_pack_id=listing_pack_id,
            cost_cap_usd=cost_cap,
            status=ListingPackStatus.pending.value,
        )
    else:
        import uuid as _u

        run_id = str(_u.uuid4())

    # Inject our chosen run_id into the input so state.run_id matches the DB id.
    input_ = {**input_, "run_id": run_id}

    yield _sse(
        "run.started",
        {
            "run_id": run_id,
            "listing_pack_id": listing_pack_id,
            "target_platforms": input_.get("target_platforms"),
        },
    )

    if persist:
        persist_update(
            run_id,
            status=ListingPackStatus.running.value,
        )

    graph = build_graph(services)
    initial = make_initial_state(input_)

    final_state: dict[str, Any] = dict(initial)
    last_error: dict | None = None

    interrupted_status: str | None = None

    try:
        async for update in graph.astream(initial, stream_mode="updates"):
            # Cooperative HITL: before processing the next node update, check
            # if the user has paused/canceled the run out-of-band.
            interrupted, status = interrupt_checker(run_id)
            if interrupted:
                interrupted_status = status
                logger.info("run %s interrupted (status=%s)", run_id, status)
                yield _sse(
                    "run.interrupted",
                    {"run_id": run_id, "status": status},
                )
                break

            # update is a dict {node_name: partial_state_update}
            for node_name, partial in update.items():
                # Apply update locally so we always have an up-to-date snapshot
                # — LangGraph itself reduces lists via the Annotated reducers
                # but for purposes of persistence + SSE we just shallow-merge.
                _merge_partial(final_state, partial)

                step_log = partial.get("step_log") or []
                # Each node should emit ONE step_log entry on completion.
                # If multiple, persist them all in order.
                if not step_log:
                    step_log = [
                        {
                            "step": node_name,
                            "status": "completed",
                            "started_at": isoformat_utc(datetime.now(timezone.utc)),
                            "ended_at": isoformat_utc(datetime.now(timezone.utc)),
                            "message": None,
                            "cost_usd": None,
                        }
                    ]

                for entry in step_log:
                    if persist:
                        persist_step(
                            agent_run_id=run_id,
                            step_name=entry["step"],
                            status=entry["status"],
                            executor_name=entry["step"],
                            outputs={
                                "message": entry.get("message"),
                                "cost_usd": entry.get("cost_usd"),
                            },
                            started_at=_parse_iso(entry.get("started_at")),
                            ended_at=_parse_iso(entry.get("ended_at")),
                        )

                    yield _sse(
                        "step.completed",
                        {
                            "run_id": run_id,
                            "step": entry["step"],
                            "status": entry["status"],
                            "message": entry.get("message"),
                            "cost_usd": entry.get("cost_usd"),
                            "current_step": partial.get("current_step", node_name),
                        },
                    )

                if partial.get("error"):
                    last_error = partial["error"]

                # Update the run row with the latest state + cost cumulatively
                if persist:
                    persist_update(
                        run_id,
                        current_step=partial.get("current_step", node_name),
                        plan=final_state.get("plan"),
                        state=state_to_jsonb_safe(final_state),
                        cost_spent_usd=_safe_decimal(
                            final_state.get("cost_spent_usd", "0")
                        ),
                    )

    except Exception as exc:  # noqa: BLE001 — surface unhandled crashes as run.failed
        logger.exception("listing_pack graph crashed; marking run failed")
        last_error = {"type": type(exc).__name__, "message": str(exc)}

        if persist:
            persist_update(
                run_id,
                status=ListingPackStatus.failed.value,
                error=last_error,
                ended_at=datetime.now(timezone.utc),
            )
        yield _sse(
            "run.failed",
            {"run_id": run_id, "error": last_error},
        )
        return

    # Decide terminal status: interrupted > error > completed.
    if interrupted_status:
        # paused: leave status alone (HITL endpoint already set it);
        # canceled: persistence write already happened in cancel_run.
        # Don't override; emit a no-op terminal SSE.
        yield _sse(
            "run.completed" if interrupted_status == "completed" else "run.interrupted",
            {
                "run_id": run_id,
                "status": interrupted_status,
                "cost_spent_usd": str(final_state.get("cost_spent_usd", "0")),
            },
        )
        return

    if last_error is not None:
        terminal = ListingPackStatus.failed.value
    else:
        terminal = ListingPackStatus.completed.value

    if persist:
        persist_update(
            run_id,
            status=terminal,
            ended_at=datetime.now(timezone.utc),
            cost_spent_usd=_safe_decimal(final_state.get("cost_spent_usd", "0")),
            error=last_error,
        )

    yield _sse(
        "run.completed" if terminal == ListingPackStatus.completed.value else "run.failed",
        {
            "run_id": run_id,
            "status": terminal,
            "cost_spent_usd": str(final_state.get("cost_spent_usd", "0")),
            "platform_outputs_count": len(final_state.get("platform_outputs") or []),
            "stamped_images_count": len(final_state.get("stamped_images") or []),
            "error": last_error,
        },
    )


# ─── helpers ────────────────────────────────────────────────────


def _merge_partial(target: dict, partial: dict | None) -> None:
    if not partial:
        return
    for k, v in partial.items():
        if k == "step_log":
            # accumulate, never overwrite
            existing = target.get("step_log") or []
            target["step_log"] = [*existing, *v]
        else:
            target[k] = v


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _safe_decimal(v: Any) -> Decimal:
    if v is None:
        return Decimal("0")
    try:
        return Decimal(str(v))
    except (ValueError, ArithmeticError):
        return Decimal("0")
