"""ModelRouter — pick a model, enforce budget, retry/fallback.

Selection rules (in order):
1. Explicit `model_hint` if it's in catalog AND supports the task.
2. Configured primary for the task kind.
3. First catalog entry supporting the task at the requested quality tier.
4. Any catalog entry supporting the task (lowest cost wins).

Failure policy (PRD § 02 § 8.1):
- `ModelUnavailable` → retry once on primary, then try each fallback in order.
- `ModelRefused`     → DO NOT retry; bubble up (user must edit prompt).
- `ModelBudgetExceeded` → bubble up; coordinator decides downgrade vs abort.
- `ModelInvalidResponse` → retry once on the SAME model with strict schema
                           re-asserted, then bubble up.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from .base import (
    ChatRequest,
    ChatResponse,
    ImageEditRequest,
    ImageEditResponse,
    ImageGenRequest,
    ImageGenResponse,
    ModelClient,
    TaskKind,
    VisionRequest,
    VisionResponse,
)
from .catalog import DEFAULT_CATALOG, ModelInfo, cost_for, models_supporting
from .cost import CostBudget
from .exceptions import (
    ModelBudgetExceeded,
    ModelInvalidResponse,
    ModelRefused,
    ModelUnavailable,
    NoModelForTask,
)

logger = logging.getLogger("listpack.models.router")


DEFAULT_PRIMARY_BY_TASK: dict[TaskKind, str] = {
    "chat": "claude-sonnet-4-6",
    "vision": "gpt-4o",
    "image_gen": "nano-banana",
    "image_edit": "flux-kontext",
}

DEFAULT_FALLBACK_BY_TASK: dict[TaskKind, list[str]] = {
    "chat": ["gpt-4o", "claude-haiku-4-5"],
    "vision": ["claude-sonnet-4-6", "gemini-2.5-pro"],
    "image_gen": ["nano-banana-pro", "gpt-image-2", "imagen-4-fast"],
    "image_edit": ["nano-banana", "gpt-image-2"],
}


@dataclass
class RouterConfig:
    primary_by_task: dict[TaskKind, str] = field(
        default_factory=lambda: dict(DEFAULT_PRIMARY_BY_TASK)
    )
    fallback_by_task: dict[TaskKind, list[str]] = field(
        default_factory=lambda: {k: list(v) for k, v in DEFAULT_FALLBACK_BY_TASK.items()}
    )
    catalog: dict[str, ModelInfo] = field(
        default_factory=lambda: dict(DEFAULT_CATALOG)
    )


class ModelRouter:
    """Asynchronous front for ModelClient instances.

    One Router per app process (held on `app.state.model_router`). Holds
    references to all configured clients keyed by `client.name`.
    """

    def __init__(
        self,
        *,
        clients: dict[str, ModelClient],
        config: RouterConfig | None = None,
    ) -> None:
        self._clients = clients
        self.config = config or RouterConfig()

    # ── public API ───────────────────────────────────────────────

    async def chat(
        self,
        req: ChatRequest,
        *,
        budget: CostBudget,
        model_hint: str | None = None,
    ) -> ChatResponse:
        return await self._dispatch(
            task="chat",
            method="chat",
            req=req,
            budget=budget,
            model_hint=model_hint,
        )

    async def vision(
        self,
        req: VisionRequest,
        *,
        budget: CostBudget,
        model_hint: str | None = None,
    ) -> VisionResponse:
        return await self._dispatch(
            task="vision",
            method="vision",
            req=req,
            budget=budget,
            model_hint=model_hint,
        )

    async def image_gen(
        self,
        req: ImageGenRequest,
        *,
        budget: CostBudget,
        model_hint: str | None = None,
    ) -> ImageGenResponse:
        return await self._dispatch(
            task="image_gen",
            method="image_gen",
            req=req,
            budget=budget,
            model_hint=model_hint,
        )

    async def image_edit(
        self,
        req: ImageEditRequest,
        *,
        budget: CostBudget,
        model_hint: str | None = None,
    ) -> ImageEditResponse:
        return await self._dispatch(
            task="image_edit",
            method="image_edit",
            req=req,
            budget=budget,
            model_hint=model_hint,
        )

    # ── selection ────────────────────────────────────────────────

    def _selection_order(
        self,
        task: TaskKind,
        model_hint: str | None,
    ) -> list[ModelInfo]:
        """Ordered list of candidate models for this task."""
        chosen: list[ModelInfo] = []
        seen: set[str] = set()

        def add(model_id: str | None) -> None:
            if not model_id or model_id in seen:
                return
            info = self.config.catalog.get(model_id)
            if info is None or task not in info.capabilities:
                return
            chosen.append(info)
            seen.add(model_id)

        add(model_hint)
        add(self.config.primary_by_task.get(task))
        for m in self.config.fallback_by_task.get(task, []):
            add(m)
        # finally any catalog entry that supports the task
        for info in models_supporting(task):
            add(info.id)

        if not chosen:
            raise NoModelForTask(f"no model in catalog supports task={task}")
        return chosen

    def _client_for(self, info: ModelInfo) -> ModelClient:
        client = self._clients.get(info.provider)
        if client is None:
            raise NoModelForTask(
                f"no ModelClient registered for provider {info.provider!r} "
                f"(needed by model {info.id})"
            )
        return client

    # ── dispatch (call + retry + fallback) ───────────────────────

    async def _dispatch(
        self,
        *,
        task: TaskKind,
        method: str,
        req: Any,
        budget: CostBudget,
        model_hint: str | None,
    ) -> Any:
        order = self._selection_order(task, model_hint)
        last_error: Exception | None = None

        for info in order:
            est_cost = cost_for(info.id)
            try:
                budget.reserve(model=info.id, est_cost=est_cost)
            except ModelBudgetExceeded:
                # If even the cheapest candidate doesn't fit, bubble up — the
                # caller might switch to template mode.
                raise

            # Rewrite the request to target this candidate, since the original
            # may have named a model the caller doesn't know is unavailable.
            req.model = info.id  # type: ignore[attr-defined]

            try:
                client = self._client_for(info)
                response = await getattr(client, method)(req)
                actual = response.usage.cost_usd or est_cost
                budget.commit_actual(
                    info.id, est_cost=est_cost, actual_cost=actual
                )
                logger.debug(
                    "model=%s task=%s cost=%s remaining_budget=%s",
                    info.id,
                    task,
                    actual,
                    budget.remaining_usd,
                )
                return response

            except ModelRefused:
                # Content-policy refusals don't recover by switching models —
                # bubble up so the user can change the prompt.
                budget.release(est_cost=est_cost)
                raise

            except (ModelUnavailable, ModelInvalidResponse) as exc:
                budget.release(est_cost=est_cost)
                logger.warning(
                    "model %s failed (%s); trying next in fallback chain",
                    info.id,
                    type(exc).__name__,
                )
                last_error = exc
                continue

        # exhausted
        raise ModelUnavailable(
            f"all candidates for task={task} failed: {last_error}",
            model=order[0].id if order else None,
        )
