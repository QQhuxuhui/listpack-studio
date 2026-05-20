"""runtime — orchestrates listing_pack runs with Postgres persistence + SSE.

D24: persists every step to agent_runs + agent_steps and exposes an SSE
stream so the web UI can show real-time progress. D25 will reuse the
same persistence layer to support pause / redo_step / fork.

Public API:
- create_agent_run, update_agent_run, insert_agent_step, list_agent_steps,
  get_agent_run    — psycopg I/O helpers
- run_listing_pack_streamed                — async generator yielding SSE events
"""

from .listing_pack_runner import run_listing_pack_streamed
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
    "AgentRunRecord",
    "AgentStepRecord",
    "create_agent_run",
    "get_agent_run",
    "insert_agent_step",
    "list_agent_steps",
    "run_listing_pack_streamed",
    "update_agent_run",
]
