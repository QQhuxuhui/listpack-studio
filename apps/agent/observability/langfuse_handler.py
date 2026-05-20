"""LangFuse callback handler for LangGraph.

LangFuse (https://langfuse.com — Apache 2.0, self-hostable) gives us
the LLM observability layer that the D47 structured logger can't:
- per-trace timeline of every LLM call (prompt + response + tokens)
- cost aggregation across providers + models
- critic-loop iteration visualisation (we can see refinement scoring)
- prompt-template version tracking

The callback handler attaches via langfuse.callback.CallbackHandler and
plugs into LangGraph's standard `config={"callbacks": [...]}` API.

Env (graceful no-op when absent):
  LANGFUSE_PUBLIC_KEY=pk_lf_...
  LANGFUSE_SECRET_KEY=sk_lf_...
  LANGFUSE_HOST=https://us.cloud.langfuse.com  (default; or self-host URL)
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("listpack.agent.observability.langfuse")


def make_langfuse_callback(
    *,
    run_id: str | None = None,
    user_id: str | None = None,
    workspace_id: str | None = None,
    tags: list[str] | None = None,
) -> Any | None:
    """Return a LangFuse CallbackHandler (or None when LangFuse not configured).

    Pass the returned handler in LangGraph config:

        config = {"callbacks": [handler], "metadata": {"run_id": run_id}}
        async for event in graph.astream(state, config=config):
            ...

    All kwargs are optional — they become searchable fields in the
    LangFuse UI so support can filter by run / user / workspace.
    """
    if not (
        os.environ.get("LANGFUSE_PUBLIC_KEY")
        and os.environ.get("LANGFUSE_SECRET_KEY")
    ):
        return None

    try:
        # Import deferred — langfuse pulls in opentelemetry-sdk which we
        # don't want at module-load time for environments not using it.
        from langfuse.callback import CallbackHandler  # type: ignore[import-not-found]
    except ImportError:
        logger.warning(
            "LANGFUSE_PUBLIC_KEY set but `langfuse` package not installed; skipping"
        )
        return None

    try:
        handler = CallbackHandler(
            public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
            secret_key=os.environ["LANGFUSE_SECRET_KEY"],
            host=os.environ.get("LANGFUSE_HOST", "https://us.cloud.langfuse.com"),
            user_id=user_id,
            session_id=run_id,  # one trace per agent run
            tags=tags or [],
            metadata={
                "workspace_id": workspace_id,
                "run_id": run_id,
            },
        )
        return handler
    except Exception as exc:  # noqa: BLE001
        logger.warning("LangFuse handler init failed: %s", exc)
        return None
