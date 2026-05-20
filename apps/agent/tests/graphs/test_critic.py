"""D22-D23 Critic + Painter-Commenter refinement loop tests."""

from __future__ import annotations

import json
from decimal import Decimal

import pytest

from graphs.listing_pack import (
    BUILTIN_CRITIC_CARDS,
    Critic,
    CriticCard,
    CriticDimension,
    CriticResult,
    damp,
    run_listing_pack,
)
from models import CostBudget, ModelRouter
from models.base import VisionRequest, VisionResponse, Usage
from models.exceptions import ModelInvalidResponse

from .conftest import CannedSceneClient


# ─── damping ────────────────────────────────────────────────────


def test_damp_smooths_change():
    # half-way pull
    assert damp(0, 10, damping=0.5) == 5
    # weaker pull
    assert damp(0, 10, damping=0.2) == 2


def test_damp_rejects_out_of_range():
    with pytest.raises(ValueError):
        damp(0, 1, damping=0)
    with pytest.raises(ValueError):
        damp(0, 1, damping=1)


# ─── built-in cards ─────────────────────────────────────────────


def test_builtin_cards_weights_sum_to_one():
    for card_id, card in BUILTIN_CRITIC_CARDS.items():
        total = sum(d.weight for d in card.dimensions)
        assert abs(total - 1.0) < 1e-6, (
            f"{card_id}: weights sum to {total}, expected 1.0"
        )


def test_builtin_card_scopes_distinct():
    assert "scene_image" in BUILTIN_CRITIC_CARDS["ecom_aesthetic_v1"].scope
    assert "main_image" in BUILTIN_CRITIC_CARDS["amazon_compliance_v1"].scope


# ─── Critic — VLM call + JSON parsing ──────────────────────────


class CriticVisionClient(CannedSceneClient):
    """Subclass with vision() returning queued critic JSON payloads."""

    def __init__(self, payloads: list[dict | str] | None = None) -> None:
        super().__init__()
        self.vision_payloads: list[dict | str] = payloads or []
        self.vision_idx = 0

    async def vision(self, req: VisionRequest) -> VisionResponse:
        self.call_log.append(("vision", req.model))
        if req.model in self.fail_for_models:
            from models.exceptions import ModelUnavailable

            raise ModelUnavailable("mock down", model=req.model)
        if not self.vision_payloads:
            raise AssertionError("no canned vision response queued")
        payload = self.vision_payloads[
            min(self.vision_idx, len(self.vision_payloads) - 1)
        ]
        self.vision_idx += 1
        text = payload if isinstance(payload, str) else json.dumps(payload)
        return VisionResponse(
            text=text,
            usage=Usage(model=req.model, cost_usd=Decimal("0.04")),
        )


def _accept_payload(score: float = 8.5) -> dict:
    return {
        "overall_score": score,
        "dimension_scores": [
            {"name": "product_fidelity", "score": 9.0, "reasoning": "Looks faithful."},
            {"name": "lighting_quality", "score": 8.0, "reasoning": "Soft."},
            {"name": "composition", "score": 8.5, "reasoning": "Centered."},
            {"name": "scene_relevance", "score": 8.0, "reasoning": "OK."},
            {"name": "ecommerce_appeal", "score": 8.0, "reasoning": "OK."},
        ],
        "improvement_directions": [],
        "decision": "accept",
    }


def _refine_payload(score: float = 5.0) -> dict:
    return {
        "overall_score": score,
        "dimension_scores": [
            {"name": "lighting_quality", "score": 4.0, "reasoning": "Too dim."},
        ],
        "improvement_directions": ["increase background brightness", "soften shadows"],
        "decision": "refine",
    }


def _abort_payload() -> dict:
    return {
        "overall_score": 1.0,
        "dimension_scores": [
            {"name": "product_fidelity", "score": 1.0, "reasoning": "Wrong product."},
        ],
        "improvement_directions": [],
        "decision": "abort",
    }


async def test_critic_evaluate_happy_path():
    client = CriticVisionClient(payloads=[_accept_payload(8.7)])
    router = ModelRouter(clients={"sparkcode": client})
    critic = Critic(router)
    budget = CostBudget(cap_usd=Decimal("1"))

    out = await critic.evaluate(
        b"\x89PNG\r\n\x1a\n",
        image_mime="image/png",
        card=BUILTIN_CRITIC_CARDS["ecom_aesthetic_v1"],
        scene_spec_dump=None,
        budget=budget,
    )

    assert out.result.decision == "accept"
    assert out.result.overall_score == pytest.approx(8.7)
    assert out.cost_usd == Decimal("0.04")


async def test_critic_parses_json_in_code_fences():
    fenced = "```json\n" + json.dumps(_accept_payload()) + "\n```"
    client = CriticVisionClient(payloads=[fenced])
    router = ModelRouter(clients={"sparkcode": client})
    critic = Critic(router)

    out = await critic.evaluate(
        b"\x89PNG\r\n\x1a\n",
        image_mime="image/png",
        card=BUILTIN_CRITIC_CARDS["ecom_aesthetic_v1"],
        scene_spec_dump=None,
        budget=CostBudget(cap_usd=Decimal("1")),
    )
    assert out.result.decision == "accept"


async def test_critic_raises_on_unparseable_response():
    client = CriticVisionClient(payloads=["this is not json"])
    router = ModelRouter(clients={"sparkcode": client})
    critic = Critic(router)

    with pytest.raises(ModelInvalidResponse):
        await critic.evaluate(
            b"\x89PNG\r\n\x1a\n",
            image_mime="image/png",
            card=BUILTIN_CRITIC_CARDS["ecom_aesthetic_v1"],
            scene_spec_dump=None,
            budget=CostBudget(cap_usd=Decimal("1")),
        )


# ─── refine_loop node — skip cases ────────────────────────────


async def test_refine_loop_skipped_when_no_critic(mocked_services, fixture_jpeg):
    """services.critic is None → step logged as skipped, no iterations."""
    mocked_services.critic = None
    src_bytes, src_mime = fixture_jpeg
    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "no_critic",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "1.00",
        },
    )
    refine_steps = [s for s in final["step_log"] if s["step"] == "refine_loop"]
    assert len(refine_steps) == 1
    assert refine_steps[0]["status"] == "skipped"
    assert "no critic" in refine_steps[0]["message"].lower()


async def test_refine_loop_skipped_when_plan_says_zero_rounds(
    mocked_services, fixture_jpeg
):
    """plan.refinement_rounds=0 (default planner) → skipped."""
    client = CriticVisionClient(payloads=[_accept_payload()])
    router = ModelRouter(clients={"sparkcode": client})
    mocked_services.critic = Critic(router)
    # leave planner=None → default plan has refinement_rounds=0
    src_bytes, src_mime = fixture_jpeg
    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "zero_rounds",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "1.00",
        },
    )
    refine = [s for s in final["step_log"] if s["step"] == "refine_loop"][0]
    assert refine["status"] == "skipped"
    assert "refinement_rounds=0" in refine["message"]


# ─── refine_loop node — full Painter-Commenter loop ───────────


async def test_refine_loop_runs_one_iter_and_accepts(mocked_services, fixture_jpeg):
    """plan.refinement_rounds=1; critic accepts immediately → no regen."""
    from graphs.listing_pack.planner import PlanSpec
    from graphs.listing_pack import Planner

    critic_client = CriticVisionClient(payloads=[_accept_payload(9.0)])
    critic_router = ModelRouter(clients={"sparkcode": critic_client})

    class _PlanPlanner(Planner):
        async def plan(self, *, user_intent, product_category, target_platforms, budget):
            return PlanSpec(
                target_platforms=list(target_platforms),
                refinement_rounds=2,  # critic budget for 2 iter
                reasoning="test forced",
            )

    mocked_services.critic = Critic(critic_router)
    mocked_services.planner = _PlanPlanner(critic_router)
    src_bytes, src_mime = fixture_jpeg

    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "one_iter_accept",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "1.00",
        },
    )

    iterations = final.get("refine_iterations") or []
    # exactly one critic call, no regen because decision=accept
    phases = [it["phase"] for it in iterations]
    assert phases == ["critic"]
    assert iterations[0]["decision"] == "accept"


async def test_refine_loop_refines_then_accepts(mocked_services, fixture_jpeg):
    """First critic call → refine; regen runs; second critic → accept."""
    from graphs.listing_pack import Planner
    from graphs.listing_pack.planner import PlanSpec

    critic_client = CriticVisionClient(
        payloads=[_refine_payload(5.5), _accept_payload(8.2)]
    )
    critic_router = ModelRouter(clients={"sparkcode": critic_client})

    class _PlanPlanner(Planner):
        async def plan(self, **kw):
            return PlanSpec(
                target_platforms=list(kw["target_platforms"]),
                refinement_rounds=2,
                reasoning="test",
            )

    mocked_services.critic = Critic(critic_router)
    mocked_services.planner = _PlanPlanner(critic_router)
    src_bytes, src_mime = fixture_jpeg

    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "refine_then_accept",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "2.00",
        },
    )

    iterations = final.get("refine_iterations") or []
    phases = [it["phase"] for it in iterations]
    # critic_1 (refine) → regen_1 → critic_2 (accept)
    assert phases == ["critic", "regen", "critic"]
    assert iterations[0]["decision"] == "refine"
    assert iterations[-1]["decision"] == "accept"


async def test_refine_loop_aborts_immediately(mocked_services, fixture_jpeg):
    """First critic returns 'abort' → loop stops, no regen."""
    from graphs.listing_pack import Planner
    from graphs.listing_pack.planner import PlanSpec

    critic_client = CriticVisionClient(payloads=[_abort_payload()])
    critic_router = ModelRouter(clients={"sparkcode": critic_client})

    class _PlanPlanner(Planner):
        async def plan(self, **kw):
            return PlanSpec(
                target_platforms=list(kw["target_platforms"]),
                refinement_rounds=3,
                reasoning="test",
            )

    mocked_services.critic = Critic(critic_router)
    mocked_services.planner = _PlanPlanner(critic_router)
    src_bytes, src_mime = fixture_jpeg

    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "abort",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "1.00",
        },
    )

    iterations = final.get("refine_iterations") or []
    phases = [it["phase"] for it in iterations]
    assert phases == ["critic"]
    assert iterations[0]["decision"] == "abort"


async def test_refine_loop_caps_at_max_iterations(mocked_services, fixture_jpeg):
    """If critic keeps returning 'refine', loop stops at max_iterations (3)."""
    from graphs.listing_pack import Planner
    from graphs.listing_pack.planner import PlanSpec

    critic_client = CriticVisionClient(
        payloads=[_refine_payload(4.0) for _ in range(10)]
    )
    critic_router = ModelRouter(clients={"sparkcode": critic_client})

    class _PlanPlanner(Planner):
        async def plan(self, **kw):
            return PlanSpec(
                target_platforms=list(kw["target_platforms"]),
                refinement_rounds=10,  # request more than max_iterations
                reasoning="test",
            )

    mocked_services.critic = Critic(critic_router)
    mocked_services.planner = _PlanPlanner(critic_router)
    src_bytes, src_mime = fixture_jpeg

    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "max_iter",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "5.00",
        },
    )

    iterations = final.get("refine_iterations") or []
    critic_calls = [it for it in iterations if it["phase"] == "critic"]
    # default max_iterations=3 in make_refine_loop_node
    assert len(critic_calls) <= 3
