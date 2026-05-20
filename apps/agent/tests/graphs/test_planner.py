"""D21 Planner tests + plan-node integration into graph."""

from __future__ import annotations

import json
from decimal import Decimal

import pytest

from graphs.listing_pack import PlanSpec, Planner, build_graph, run_listing_pack
from graphs.listing_pack.state import make_initial_state
from models import CostBudget, ModelRouter
from models.base import ChatRequest, ChatResponse, Usage
from models.exceptions import ModelUnavailable

from .conftest import CannedSceneClient


# ─── plan schema ────────────────────────────────────────────────


def test_plan_spec_minimal_validates():
    spec = PlanSpec(target_platforms=["amazon"], reasoning="defaults")
    assert spec.render_scene is True
    assert spec.render_a_plus is False
    assert spec.refinement_rounds == 0


def test_plan_spec_refinement_capped():
    with pytest.raises(Exception):
        PlanSpec(target_platforms=["amazon"], reasoning="x", refinement_rounds=99)


# ─── Planner LLM happy path ─────────────────────────────────────


class PlanClient(CannedSceneClient):
    """Returns a PlanSpec JSON instead of a SceneSpec JSON for chat calls.

    `chat_responses` is consumed in order; defaults to one canned plan.
    """

    def __init__(self, responses: list[dict] | None = None) -> None:
        super().__init__()
        self._plans = responses or [
            {
                "plan_version": "1.0",
                "render_scene": True,
                "render_a_plus": False,
                "render_banner": True,
                "target_platforms": ["amazon"],
                "refinement_rounds": 1,
                "reasoning": "User asked for high-quality banner; A+ off",
            }
        ]
        self._idx = 0

    async def chat(self, req: ChatRequest) -> ChatResponse:
        self.call_log.append(("chat", req.model))
        if req.model in self.fail_for_models:
            raise ModelUnavailable("mock down", model=req.model)
        body = self._plans[min(self._idx, len(self._plans) - 1)]
        self._idx += 1
        return ChatResponse(
            text=json.dumps(body),
            json_data=body,
            usage=Usage(model=req.model, cost_usd=Decimal("0.02")),
        )


async def test_planner_returns_llm_plan():
    client = PlanClient()
    router = ModelRouter(clients={"sparkcode": client})
    planner = Planner(router)
    budget = CostBudget(cap_usd=Decimal("1"))

    spec = await planner.plan(
        user_intent="high quality banner with promo",
        product_category="apparel",
        target_platforms=["amazon"],
        budget=budget,
    )

    assert spec.render_scene is True
    assert spec.render_banner is True
    assert spec.target_platforms == ["amazon"]
    assert spec.refinement_rounds == 1
    assert budget.spent_usd == Decimal("0.02")


async def test_planner_preserves_caller_platforms_even_if_llm_drops_them():
    """LLM tries to drop 'shopify' from list — Planner must overrule it."""
    client = PlanClient(
        responses=[
            {
                "plan_version": "1.0",
                "render_scene": True,
                "render_a_plus": False,
                "render_banner": False,
                "target_platforms": ["amazon"],  # LLM forgot shopify
                "refinement_rounds": 0,
                "reasoning": "default",
            }
        ]
    )
    router = ModelRouter(clients={"sparkcode": client})
    planner = Planner(router)

    spec = await planner.plan(
        user_intent="scene only",
        product_category=None,
        target_platforms=["amazon", "shopify"],
        budget=CostBudget(cap_usd=Decimal("1")),
    )
    assert set(spec.target_platforms) == {"amazon", "shopify"}


# ─── heuristic fallback ─────────────────────────────────────────


async def test_planner_falls_back_when_llm_unreachable():
    """LLM all models down → fallback PlanSpec returned (no exception)."""
    client = PlanClient()
    client.fail_for_models = {
        "claude-sonnet-4-6",
        "gpt-4o",
        "claude-haiku-4-5",
        "gemini-2.5-pro",
    }
    router = ModelRouter(clients={"sparkcode": client})
    planner = Planner(router)

    spec = await planner.plan(
        user_intent="big sale banner with promo",
        product_category="apparel",
        target_platforms=["amazon", "tiktok"],
        budget=CostBudget(cap_usd=Decimal("1")),
    )

    # Heuristic: banner ON (intent has 'banner' / 'sale' / tiktok platform)
    assert spec.render_banner is True
    assert spec.render_scene is True
    assert spec.render_a_plus is False
    assert "fallback" in spec.reasoning.lower()


# ─── plan node integration into graph ───────────────────────────


async def test_graph_with_planner_emits_plan_in_state(mocked_services, fixture_jpeg):
    """Production graph: services has a Planner → state.plan populated."""
    mocked_services.planner = Planner(mocked_services.router)
    source_bytes, source_mime = fixture_jpeg
    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "run_with_planner",
            "source_image_bytes": source_bytes,
            "source_image_mime": source_mime,
            "target_platforms": ["amazon"],
            "user_intent": "studio shot",
            "cost_cap_usd": "1.00",
        },
    )

    assert final["plan"] is not None
    assert final["plan"]["render_scene"] is True
    # plan step should be the first one logged
    assert final["step_log"][0]["step"] == "plan"


async def test_graph_without_planner_uses_default_plan(mocked_services, fixture_jpeg):
    """Legacy callers (services.planner=None) get a default plan, no crash."""
    mocked_services.planner = None
    source_bytes, source_mime = fixture_jpeg
    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "run_no_planner",
            "source_image_bytes": source_bytes,
            "source_image_mime": source_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "0.50",
        },
    )
    assert final["plan"]["render_scene"] is True
    assert "no planner configured" in final["plan"]["reasoning"]
