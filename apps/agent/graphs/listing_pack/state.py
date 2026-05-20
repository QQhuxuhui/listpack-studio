"""ListingPackState — the typed dict threaded through every graph node.

LangGraph requires a TypedDict (not BaseModel) for the state container.
Each node returns a partial dict that LangGraph shallow-merges into the
running state, so node functions can append to lists / set sentinels
without overwriting siblings.

Mirrors `agent_runs.state` JSONB in apps/web Drizzle schema. Persisted via
LangGraph's checkpointer (SQLite for dev, PostgreSQL for prod — D24).
"""

from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Annotated, Any, TypedDict

from langgraph.graph.message import add_messages


class ListingPackStatus(str, Enum):
    """Mirrors `agent_run_status` Postgres enum (apps/web/lib/db/schema.ts)."""

    pending = "pending"
    planning = "planning"
    running = "running"
    paused = "paused"
    awaiting_user = "awaiting_user"
    completed = "completed"
    failed = "failed"
    canceled = "canceled"


class ListingPackInput(TypedDict, total=False):
    """Required + optional fields a caller hands to `run_listing_pack`.

    Kept separate from ListingPackState so callers don't have to construct
    the full state shape with None defaults.
    """

    # required
    run_id: str
    source_image_bytes: bytes
    source_image_mime: str
    target_platforms: list[str]  # e.g. ["amazon", "shopify"]
    # optional
    target_category: str | None
    user_intent: str | None
    cost_cap_usd: str | None  # Decimal serialised


def _append(left: list, right: list) -> list:
    """Reducer used for fields that accumulate (logs, errors)."""
    return [*left, *right]


class StepLogEntry(TypedDict):
    """One row in the agent's step history — surfaced via SSE."""

    step: str
    started_at: str  # ISO 8601
    ended_at: str | None
    status: str  # 'running' / 'completed' / 'failed' / 'skipped'
    message: str | None
    cost_usd: str | None


class ListingPackState(TypedDict, total=False):
    """Container threaded through every node.

    All fields are optional because LangGraph composes the state via partial
    updates. Use `total=False` so node return-dicts only carry the keys they
    actually changed.
    """

    # ── identity & status ─────────────────────────────────────────
    run_id: str
    status: ListingPackStatus
    current_step: str
    error: dict[str, Any] | None

    # ── inputs (frozen after Plan node sets them) ────────────────
    source_image_bytes: bytes
    source_image_mime: str
    target_platforms: list[str]
    target_category: str | None
    user_intent: str | None
    cost_cap_usd: str  # Decimal as str for JSON-safety in checkpointer

    # ── progressively populated outputs ──────────────────────────
    plan: dict[str, Any] | None  # PlanSpec.model_dump() — set by plan node (D21)
    compliance_overall: str | None  # 'pass' / 'warn' / 'fail'
    compliance_failures: list[dict[str, Any]]
    scene_spec: dict[str, Any] | None  # SceneSpec.model_dump()
    scene_prompt: str | None
    scene_image_bytes: bytes | None
    scene_image_model: str | None
    scene_image_cost_usd: str | None
    stamped_images: list[dict[str, Any]]  # per-platform stamped outputs
    platform_outputs: list[dict[str, Any]]  # per-platform adapter outputs

    # ── accumulating fields ──────────────────────────────────────
    step_log: Annotated[list[StepLogEntry], _append]
    cost_spent_usd: str  # running Decimal sum
    cumulative_messages: Annotated[list[dict], add_messages]  # for LLM continuity


def make_initial_state(input_: ListingPackInput) -> ListingPackState:
    """Initialise a fresh state from a caller's input."""
    return ListingPackState(
        run_id=input_["run_id"],
        status=ListingPackStatus.pending,
        current_step="initialised",
        error=None,
        source_image_bytes=input_["source_image_bytes"],
        source_image_mime=input_["source_image_mime"],
        target_platforms=list(input_["target_platforms"]),
        target_category=input_.get("target_category"),
        user_intent=input_.get("user_intent"),
        cost_cap_usd=str(input_.get("cost_cap_usd") or "0.50"),
        plan=None,
        compliance_overall=None,
        compliance_failures=[],
        scene_spec=None,
        scene_prompt=None,
        scene_image_bytes=None,
        scene_image_model=None,
        scene_image_cost_usd=None,
        stamped_images=[],
        platform_outputs=[],
        step_log=[],
        cost_spent_usd="0",
        cumulative_messages=[],
    )


def remaining_budget(state: ListingPackState) -> Decimal:
    cap = Decimal(state.get("cost_cap_usd", "0"))
    spent = Decimal(state.get("cost_spent_usd", "0"))
    return cap - spent
