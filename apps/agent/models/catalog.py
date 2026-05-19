"""Model catalog: id → capabilities + cost estimate.

Single source of truth for "what models do we know about and roughly what
do they cost?" — used by the Router to pick + budget, and by tests to
spin up mock clients with realistic numbers.

Costs are *estimates per call* (not per-token) because most image models
charge per image and chat models are usually small enough that one
turn ≈ one notional unit. Refine as we collect real billing telemetry
(PRD § 02 § 11.5 budget enforcement).

Numbers come from PRD § 04 § 3.1.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from .base import TaskKind


@dataclass(frozen=True)
class ModelInfo:
    id: str
    provider: str  # 'sparkcode' (default) / 'replicate' / etc.
    capabilities: frozenset[TaskKind]
    cost_per_call_usd: Decimal
    # 1 = cheap/fast/lower-quality, 3 = premium
    quality_tier: int = 2
    # Free-form notes shown in /v1/compliance/rules-style introspection
    notes: str = ""


def _info(
    id: str,
    provider: str,
    caps: list[TaskKind],
    cost: str,
    *,
    quality_tier: int = 2,
    notes: str = "",
) -> ModelInfo:
    return ModelInfo(
        id=id,
        provider=provider,
        capabilities=frozenset(caps),
        cost_per_call_usd=Decimal(cost),
        quality_tier=quality_tier,
        notes=notes,
    )


# ─── seed catalog ──────────────────────────────────────────────────


DEFAULT_CATALOG: dict[str, ModelInfo] = {
    # ── Chat / Vision LLMs ──
    "claude-sonnet-4-6": _info(
        "claude-sonnet-4-6",
        "sparkcode",
        ["chat", "vision"],
        "0.02",
        quality_tier=3,
        notes="Default Planner + SceneJsonExecutor + Critic when budget allows.",
    ),
    "claude-haiku-4-5": _info(
        "claude-haiku-4-5",
        "sparkcode",
        ["chat", "vision"],
        "0.005",
        quality_tier=2,
        notes="Cheaper fallback for SceneJson when budget is tight.",
    ),
    "gpt-4o": _info(
        "gpt-4o",
        "sparkcode",
        ["chat", "vision"],
        "0.02",
        quality_tier=3,
        notes="Critic alternative; better at structured output for some prompts.",
    ),
    "gemini-2.5-pro": _info(
        "gemini-2.5-pro",
        "sparkcode",
        ["chat", "vision"],
        "0.018",
        quality_tier=3,
    ),
    # ── Image generation ──
    "nano-banana": _info(
        "nano-banana",
        "sparkcode",
        ["image_gen", "image_edit"],
        "0.039",
        quality_tier=2,
        notes="Default scene_gen / banner workhorse.",
    ),
    "nano-banana-pro": _info(
        "nano-banana-pro",
        "sparkcode",
        ["image_gen", "image_edit"],
        "0.06",
        quality_tier=3,
        notes="Higher fidelity scene_gen for Brand+ tiers.",
    ),
    "gpt-image-2": _info(
        "gpt-image-2",
        "sparkcode",
        ["image_gen", "image_edit"],
        "0.06",
        quality_tier=3,
    ),
    "flux-kontext": _info(
        "flux-kontext",
        "sparkcode",
        ["image_gen", "image_edit"],
        "0.05",
        quality_tier=3,
        notes="Best for region-aware image_edit (inpaint / outpaint).",
    ),
    "imagen-4-fast": _info(
        "imagen-4-fast",
        "sparkcode",
        ["image_gen"],
        "0.02",
        quality_tier=1,
        notes="Cheap fallback for free-tier scene_gen.",
    ),
}


def models_supporting(task: TaskKind) -> list[ModelInfo]:
    return [m for m in DEFAULT_CATALOG.values() if task in m.capabilities]


def cost_for(model_id: str) -> Decimal:
    if model_id not in DEFAULT_CATALOG:
        return Decimal("0.05")  # opaque-cost safety estimate
    return DEFAULT_CATALOG[model_id].cost_per_call_usd
