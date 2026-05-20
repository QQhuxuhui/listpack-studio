"""LangGraph node functions for the listing_pack graph.

Each node:
1. Reads what it needs from `state`.
2. Performs its work (delegating to compliance / scene_spec / generators /
   models layers — never re-implements business logic).
3. Returns a partial `ListingPackState` dict that LangGraph merges in.

Nodes are async so LangGraph can await I/O without blocking. CPU-bound
sync work (Pillow / numpy) is wrapped in `asyncio.to_thread` to keep
the event loop responsive.

The nodes use a `Services` dependency bag rather than module-level
singletons. D19-D20 tests inject a `Services` populated with mocks; the
production `Services` (built in server.py) wires real router / cache /
DB / executor instances.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Callable

from compliance.engine import run_compliance_check
from compliance.loader import load_active_rules
from compliance.schemas import ComplianceReport
from generators import (
    C2PAStamper,
    GeneratedImage,
    ImageExecutor,
    PlatformAdapter,
    PlatformSlot,
)
from models.cost import CostBudget
from models.router import ModelRouter
from scene_spec import (
    Background,
    BackgroundType,
    Constraints,
    Product,
    SceneJsonExecutor,
    SceneSpec,
)

from .planner import Planner, PlanSpec
from .state import (
    ListingPackState,
    ListingPackStatus,
    StepLogEntry,
)

logger = logging.getLogger("listpack.graphs.listing_pack.nodes")


# ── service bag (injected at graph build time) ─────────────────────


@dataclass
class Services:
    """Externally-owned dependencies the nodes use.

    Built once in `server.py` lifespan and passed into `build_graph(services)`.
    Tests build a Services with mocks (see tests/graphs/conftest.py).
    """

    router: ModelRouter
    scene_executor: SceneJsonExecutor
    image_executor: ImageExecutor
    platform_adapter: PlatformAdapter
    c2pa_stamper: C2PAStamper
    planner: Planner | None = None  # D21; defaults to None so old tests still work
    # rules_loader can be a function so tests can stub the DB call without
    # mocking psycopg.
    rules_loader: Callable[..., list] = field(default=load_active_rules)


# ── helpers ────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _step_log(
    step: str,
    *,
    status: str,
    message: str | None = None,
    cost_usd: Decimal | None = None,
    started_at: str | None = None,
    ended_at: str | None = None,
) -> StepLogEntry:
    return StepLogEntry(
        step=step,
        started_at=started_at or _now_iso(),
        ended_at=ended_at,
        status=status,
        message=message,
        cost_usd=str(cost_usd) if cost_usd is not None else None,
    )


def _accumulate_cost(state: ListingPackState, delta: Decimal) -> str:
    return str(Decimal(state.get("cost_spent_usd", "0")) + delta)


# ── plan (LLM decides which branches to run) ──────────────────────


def make_plan_node(services: Services):
    """Decide which downstream branches to run via Planner.

    If services.planner is None (legacy tests, minimum graph), emit a
    default plan with render_scene=True only.
    """

    async def plan(state: ListingPackState) -> dict:
        started = _now_iso()

        target_platforms = state.get("target_platforms") or ["amazon"]
        category = state.get("target_category")
        user_intent = state.get("user_intent")
        budget = CostBudget(
            cap_usd=Decimal(state["cost_cap_usd"]) - Decimal(state.get("cost_spent_usd", "0"))
        )

        if services.planner is None:
            plan_spec = PlanSpec(
                render_scene=True,
                render_a_plus=False,
                render_banner=False,
                target_platforms=list(target_platforms),
                refinement_rounds=0,
                reasoning="no planner configured; default plan = scene only",
            )
            spent_delta = Decimal("0")
        else:
            try:
                plan_spec = await services.planner.plan(
                    user_intent=user_intent,
                    product_category=category,
                    target_platforms=list(target_platforms),
                    budget=budget,
                )
                spent_delta = budget.spent_usd
            except Exception as exc:
                logger.exception("planner failed")
                return {
                    "status": ListingPackStatus.failed,
                    "current_step": "plan",
                    "error": {
                        "step": "plan",
                        "type": type(exc).__name__,
                        "message": str(exc),
                    },
                    "step_log": [
                        _step_log(
                            "plan",
                            status="failed",
                            message=str(exc),
                            started_at=started,
                            ended_at=_now_iso(),
                        )
                    ],
                }

        return {
            "status": ListingPackStatus.planning,
            "current_step": "plan",
            "plan": plan_spec.model_dump(mode="json"),
            "cost_spent_usd": _accumulate_cost(state, spent_delta),
            "step_log": [
                _step_log(
                    "plan",
                    status="completed",
                    cost_usd=spent_delta,
                    message=plan_spec.reasoning,
                    started_at=started,
                    ended_at=_now_iso(),
                )
            ],
        }

    return plan


# ── compliance check (pre-flight on source image) ─────────────────


def make_compliance_check_node(services: Services):
    """Run the source image through the active rules. Failures don't abort
    the run — they're recorded on state so downstream nodes / UI can react.
    """

    async def compliance_check(state: ListingPackState) -> dict:
        started = _now_iso()
        target_platform = state["target_platforms"][0] if state["target_platforms"] else "amazon"

        def _sync():
            rules = services.rules_loader(target_platform, state.get("target_category"))
            return run_compliance_check(
                state["source_image_bytes"],
                state["source_image_mime"],
                rules,
                target_platform=target_platform,
                target_category=state.get("target_category"),
            )

        try:
            report: ComplianceReport = await asyncio.to_thread(_sync)
        except Exception as exc:
            logger.exception("compliance_check failed")
            return {
                "status": ListingPackStatus.failed,
                "current_step": "compliance_check",
                "error": {
                    "step": "compliance_check",
                    "type": type(exc).__name__,
                    "message": str(exc),
                },
                "step_log": [
                    _step_log(
                        "compliance_check",
                        status="failed",
                        message=str(exc),
                        started_at=started,
                        ended_at=_now_iso(),
                    )
                ],
            }

        failures = [
            {
                "rule_key": r.rule_key,
                "severity": r.severity.value,
                "evidence": r.evidence,
            }
            for r in report.rule_results
            if not r.passed
        ]
        return {
            "status": ListingPackStatus.running,
            "current_step": "compliance_check",
            "compliance_overall": report.overall.value,
            "compliance_failures": failures,
            "step_log": [
                _step_log(
                    "compliance_check",
                    status="completed",
                    message=f"overall={report.overall.value} failures={len(failures)}",
                    started_at=started,
                    ended_at=_now_iso(),
                )
            ],
        }

    return compliance_check


# ── scene_json (LLM SceneSpec) ────────────────────────────────────


def make_scene_json_node(services: Services):
    async def scene_json(state: ListingPackState) -> dict:
        started = _now_iso()
        budget = CostBudget(cap_usd=Decimal(state["cost_cap_usd"]) - Decimal(state.get("cost_spent_usd", "0")))

        # Derive constraints from compliance failures on the source image:
        # if Amazon main_image.background_white tripped, force white BG;
        # if no_text tripped, set no_text_in_image=True; etc.
        constraints = _derive_constraints(state)

        try:
            spec = await services.scene_executor.generate(
                user_intent=state.get("user_intent") or "studio product shot",
                product_metadata={
                    "category": state.get("target_category"),
                    "platforms": state["target_platforms"],
                },
                constraints=constraints,
                budget=budget,
            )
        except Exception as exc:
            logger.exception("scene_json failed")
            return {
                "status": ListingPackStatus.failed,
                "current_step": "scene_json",
                "error": {
                    "step": "scene_json",
                    "type": type(exc).__name__,
                    "message": str(exc),
                },
                "step_log": [
                    _step_log(
                        "scene_json",
                        status="failed",
                        message=str(exc),
                        started_at=started,
                        ended_at=_now_iso(),
                    )
                ],
            }

        spent_delta = budget.spent_usd
        return {
            "status": ListingPackStatus.running,
            "current_step": "scene_json",
            "scene_spec": spec.model_dump(mode="json"),
            "cost_spent_usd": _accumulate_cost(state, spent_delta),
            "step_log": [
                _step_log(
                    "scene_json",
                    status="completed",
                    cost_usd=spent_delta,
                    started_at=started,
                    ended_at=_now_iso(),
                )
            ],
        }

    return scene_json


def _derive_constraints(state: ListingPackState) -> Constraints:
    failed_keys = {f["rule_key"] for f in state.get("compliance_failures", [])}
    return Constraints(
        no_text_in_image=any("no_text" in k for k in failed_keys),
        background_must_be_white=any(
            "background_white" in k for k in failed_keys
        ),
        no_person=any("no_person" in k for k in failed_keys),
        no_props=any("single_product" in k for k in failed_keys),
    )


# ── image_gen (ImageExecutor + cache) ─────────────────────────────


def make_image_gen_node(services: Services):
    async def image_gen(state: ListingPackState) -> dict:
        started = _now_iso()
        spec_dump = state.get("scene_spec")
        if not spec_dump:
            return {
                "status": ListingPackStatus.failed,
                "current_step": "image_gen",
                "error": {"step": "image_gen", "message": "scene_spec missing"},
            }

        spec = SceneSpec.model_validate(spec_dump)
        budget = CostBudget(
            cap_usd=Decimal(state["cost_cap_usd"]) - Decimal(state.get("cost_spent_usd", "0"))
        )

        try:
            generated: GeneratedImage = await services.image_executor.generate(
                spec, budget=budget
            )
        except Exception as exc:
            logger.exception("image_gen failed")
            return {
                "status": ListingPackStatus.failed,
                "current_step": "image_gen",
                "error": {
                    "step": "image_gen",
                    "type": type(exc).__name__,
                    "message": str(exc),
                },
                "step_log": [
                    _step_log(
                        "image_gen",
                        status="failed",
                        message=str(exc),
                        started_at=started,
                        ended_at=_now_iso(),
                    )
                ],
            }

        return {
            "status": ListingPackStatus.running,
            "current_step": "image_gen",
            "scene_image_bytes": generated.bytes_data,
            "scene_image_model": generated.model_id,
            "scene_image_cost_usd": str(generated.cost_usd),
            "scene_prompt": generated.prompt,
            "cost_spent_usd": _accumulate_cost(state, generated.cost_usd),
            "step_log": [
                _step_log(
                    "image_gen",
                    status="completed",
                    cost_usd=generated.cost_usd,
                    message=(
                        f"model={generated.model_id} cache_hit={generated.cache_hit}"
                    ),
                    started_at=started,
                    ended_at=_now_iso(),
                )
            ],
        }

    return image_gen


# ── platform_adapt (multi-size) ───────────────────────────────────


def make_platform_adapt_node(services: Services):
    async def platform_adapt(state: ListingPackState) -> dict:
        started = _now_iso()
        scene_bytes = state.get("scene_image_bytes")
        if not scene_bytes:
            return {
                "status": ListingPackStatus.failed,
                "current_step": "platform_adapt",
                "error": {"step": "platform_adapt", "message": "scene_image_bytes missing"},
            }

        platforms = state["target_platforms"]
        adapted = await asyncio.to_thread(
            services.platform_adapter.adapt_all_platforms,
            scene_bytes,
            platforms,
        )

        outputs = [
            {
                "slot": a.slot.value if hasattr(a.slot, "value") else str(a.slot),
                "width": a.width,
                "height": a.height,
                "mime": a.mime,
                "byte_count": len(a.bytes_data),
            }
            for a in adapted
        ]
        return {
            "status": ListingPackStatus.running,
            "current_step": "platform_adapt",
            "platform_outputs": outputs,
            "step_log": [
                _step_log(
                    "platform_adapt",
                    status="completed",
                    message=f"{len(outputs)} slots × {len(platforms)} platforms",
                    started_at=started,
                    ended_at=_now_iso(),
                )
            ],
        }

    return platform_adapt


# ── c2pa_stamp (AI-disclosure metadata) ───────────────────────────


def make_c2pa_stamp_node(services: Services):
    async def c2pa_stamp(state: ListingPackState) -> dict:
        started = _now_iso()
        scene_bytes = state.get("scene_image_bytes")
        if not scene_bytes:
            return {
                "status": ListingPackStatus.failed,
                "current_step": "c2pa_stamp",
                "error": {"step": "c2pa_stamp", "message": "scene_image_bytes missing"},
            }

        model = state.get("scene_image_model") or "unknown"

        def _sync():
            return services.c2pa_stamper.stamp(
                scene_bytes,
                mime="image/png",
                model_id=model,
            )

        result = await asyncio.to_thread(_sync)

        return {
            "status": ListingPackStatus.completed,
            "current_step": "c2pa_stamp",
            "stamped_images": [
                {
                    "mime": result.mime,
                    "byte_count": len(result.bytes_out),
                    "disclosure": result.disclosure,
                }
            ],
            "step_log": [
                _step_log(
                    "c2pa_stamp",
                    status="completed",
                    message=f"stamped {model}",
                    started_at=started,
                    ended_at=_now_iso(),
                )
            ],
        }

    return c2pa_stamp
