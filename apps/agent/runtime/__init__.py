"""runtime — orchestrates listing_pack runs with Postgres persistence + SSE.

D24: persists every step to agent_runs + agent_steps and exposes an SSE
stream so the web UI can show real-time progress. D25 will reuse the
same persistence layer to support pause / redo_step / fork.

Public API:
- create_agent_run, update_agent_run, insert_agent_step, list_agent_steps,
  get_agent_run    — psycopg I/O helpers
- run_listing_pack_streamed                — async generator yielding SSE events
"""

from .hitl import (
    HITLError,
    InvalidStateTransition,
    RunNotFound,
    cancel_run,
    fork_run,
    is_run_interrupted,
    pause_run,
    resume_run,
)
from .listing_pack_runner import run_listing_pack_streamed
from .quota import (
    PLAN_CATALOG,
    PlanLimits,
    QuotaError,
    QuotaExceeded,
    QuotaSnapshot,
    SubscriptionMissing,
    check_quota,
    get_workspace_quota,
    record_usage,
    reset_sku_used,
    resolve_workspace_for_listing_pack,
)
from .persistence import (
    AgentRunRecord,
    AgentStepRecord,
    create_agent_run,
    get_agent_run,
    insert_agent_step,
    list_agent_steps,
    update_agent_run,
)

__all__ = [
    "PLAN_CATALOG",
    "AgentRunRecord",
    "AgentStepRecord",
    "HITLError",
    "InvalidStateTransition",
    "PlanLimits",
    "QuotaError",
    "QuotaExceeded",
    "QuotaSnapshot",
    "RunNotFound",
    "SubscriptionMissing",
    "cancel_run",
    "check_quota",
    "create_agent_run",
    "fork_run",
    "get_agent_run",
    "get_workspace_quota",
    "insert_agent_step",
    "is_run_interrupted",
    "list_agent_steps",
    "pause_run",
    "record_usage",
    "reset_sku_used",
    "resolve_workspace_for_listing_pack",
    "resume_run",
    "run_listing_pack_streamed",
    "update_agent_run",
]
