"""Planner — decide which downstream branches to run.

Phase 2 + 3 gave us a toolbox (scene_json / image_gen / a_plus_build /
banner_build / platform_adapt / c2pa_stamp). Phase 4 D21 adds the Agent
that decides which subset of the toolbox to actually invoke for THIS run.

PRD § 02 § 7.2: Planner is an LLM call, not a hand-coded switch. The LLM
sees user intent + product metadata + target platforms + the cost cap and
returns a `PlanSpec` instructing the graph which branches to take. The
graph then uses conditional edges to honour the plan.

Why an LLM (not a hand-coded rule):
- User intent shapes module choice ("I just want a square banner for
  Instagram" → render_banner=True, skip A+).
- Category gates regulated modules ("supplements" → never auto-generate
  A+ Content because Amazon Section 3 risk).
- Cost cap may force narrowing ("budget $0.10" → only the cheapest scene).

A hard-coded heuristic fallback also lives here for the days the LLM is
unreachable — graph then falls back to "scene only" so the run still
produces something useful.
"""

from __future__ import annotations

import json
import logging
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from models.base import ChatMessage, ChatRequest
from models.cost import CostBudget
from models.exceptions import ModelInvalidResponse
from models.router import ModelRouter

logger = logging.getLogger("listpack.graphs.listing_pack.planner")


# ─── plan output schema ──────────────────────────────────────────


class PlanSpec(BaseModel):
    """The plan a Planner emits.

    Stored on `AgentRun.plan` JSONB in apps/web schema; graph reads it to
    decide conditional edges.
    """

    model_config = ConfigDict(populate_by_name=True)

    plan_version: Literal["1.0"] = "1.0"
    render_scene: bool = True
    render_a_plus: bool = False
    render_banner: bool = False
    target_platforms: list[str] = Field(min_length=1)
    refinement_rounds: int = Field(default=0, ge=0, le=3)
    reasoning: str = Field(min_length=1, max_length=500)


def plan_json_schema() -> dict:
    return PlanSpec.model_json_schema()


# ─── prompts ─────────────────────────────────────────────────────


_SYSTEM = """\
You are ListPack's planning agent. Given the user intent + product metadata
+ a list of target platforms + a cost cap, decide which modules to render.

Output a PlanSpec JSON object. Stick to these rules:

1. ALWAYS set render_scene=true. The lifestyle / hero scene image is
   table-stakes for every listing.
2. render_a_plus=true ONLY for Amazon-targeted runs where the user
   asked for "A+ Content" or "infographic" or where the category is
   apparel / kitchen / consumer_electronics (Amazon Brand Registry zones
   that gain the most from A+).
3. render_banner=true when the user mentions "banner", "promo", "sale",
   or any platform is "tiktok"/"shopify" with implied marketing intent.
4. NEVER recommend render_a_plus for regulated categories: supplements,
   pet_supplements, cosmetics, food, kids_toys. These need manual A+
   content per FDA / CPSIA review.
5. refinement_rounds: 0 by default, 1 if user mentions "high quality"
   or "premium", up to 3 if user mentions "perfect" or "best".
6. Echo the user's target_platforms list verbatim — don't drop or add.

`reasoning` is a one-sentence explanation in English. Keep it under 200 chars.
"""


# ─── planner agent ───────────────────────────────────────────────


class Planner:
    """LLM-backed planner with a heuristic fallback."""

    def __init__(
        self,
        router: ModelRouter,
        *,
        model_hint: str | None = None,
    ) -> None:
        self._router = router
        self._model_hint = model_hint

    async def plan(
        self,
        *,
        user_intent: str | None,
        product_category: str | None,
        target_platforms: list[str],
        budget: CostBudget,
    ) -> PlanSpec:
        """Return a PlanSpec. Falls back to a safe default on LLM failure."""
        if not target_platforms:
            raise ValueError("at least one target platform required")

        user_msg = json.dumps(
            {
                "user_intent": user_intent or "",
                "product_category": product_category,
                "target_platforms": target_platforms,
                "remaining_budget_usd": str(budget.remaining_usd),
            },
            ensure_ascii=False,
        )
        req = ChatRequest(
            model="(router-chooses)",
            messages=[
                ChatMessage(role="system", content=_SYSTEM),
                ChatMessage(role="user", content=user_msg),
            ],
            json_schema=plan_json_schema(),
            temperature=0.2,
            max_tokens=600,
        )

        try:
            resp = await self._router.chat(
                req, budget=budget, model_hint=self._model_hint
            )
            data = resp.json_data or json.loads(resp.text)
            spec = PlanSpec.model_validate(data)
            # Always trust the input platforms list — never drop or rename.
            spec.target_platforms = list(target_platforms)
            return spec
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("planner parse failed (%s); falling back to defaults", exc)
        except ModelInvalidResponse as exc:
            logger.warning("planner invalid response (%s); using defaults", exc)
        except Exception as exc:  # noqa: BLE001 — last-resort safety net
            logger.warning("planner LLM unreachable (%s); using defaults", exc)

        return self._heuristic_default(
            user_intent=user_intent,
            product_category=product_category,
            target_platforms=target_platforms,
        )

    # ── heuristic fallback ────────────────────────────────────────

    @staticmethod
    def _heuristic_default(
        *,
        user_intent: str | None,
        product_category: str | None,
        target_platforms: list[str],
    ) -> PlanSpec:
        """Safe default when the LLM can't be reached.

        - scene always on
        - banner on if user mentions promo / banner / sale, OR platform is tiktok
        - A+ off (it's the most likely to look wrong without human review)
        - 0 refinement rounds (saves cost + latency)
        """
        intent = (user_intent or "").lower()
        wants_banner = (
            any(k in intent for k in ("banner", "promo", "sale", "discount"))
            or "tiktok" in target_platforms
        )
        return PlanSpec(
            render_scene=True,
            render_a_plus=False,
            render_banner=wants_banner,
            target_platforms=list(target_platforms),
            refinement_rounds=0,
            reasoning=(
                "Heuristic fallback (LLM unreachable). Scene on, banner per "
                "intent keywords / TikTok, A+ off (regulated review needed)."
            ),
        )
