"""D13 SceneJsonExecutor tests — uses MockModelClient (no HTTP)."""

from __future__ import annotations

import json
from decimal import Decimal

import pytest

from models import CostBudget, ModelInvalidResponse, ModelRouter, RouterConfig
from models.base import ChatRequest, ChatResponse, Usage
from scene_spec import Constraints, SceneJsonExecutor
from tests.models.conftest import MockModelClient


# ─── scripted client that ignores LLM and returns canned JSON ────


class CannedSceneClient(MockModelClient):
    """Like MockModelClient but `chat()` returns a fixed JSON spec.

    The first attempt returns `chat_responses[0]`; subsequent attempts return
    the next entry. Useful for testing retry-on-parse-failure logic.
    """

    def __init__(
        self,
        chat_responses: list[str],
        cost_per_call: Decimal = Decimal("0.02"),
    ) -> None:
        super().__init__()
        self._chat_responses = chat_responses
        self._idx = 0
        self._fixed_cost = cost_per_call

    async def chat(self, req: ChatRequest) -> ChatResponse:
        self.call_log.append(("chat", req.model))
        text = self._chat_responses[min(self._idx, len(self._chat_responses) - 1)]
        self._idx += 1
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = None
        return ChatResponse(
            text=text,
            json_data=data,
            usage=Usage(model=req.model, cost_usd=self._fixed_cost),
        )


VALID_SPEC_JSON = json.dumps(
    {
        "scene_spec_version": "1.0",
        "background": {
            "type": "scene",
            "value": "outdoor summer garden",
            "lighting": "golden_hour",
            "mood": "warm",
        },
        "color_palette": ["#F5C2C7", "#FFFFFF"],
        "aspect_ratio": "1:1",
        "product": {
            "asset_ref": "asset_test",
            "preserve_fidelity": True,
            "position": "center",
            "scale": 0.85,
            "rotation": 0,
        },
        "elements": [
            {"type": "decoration", "description": "rose petals",
             "position": "around_product", "density": "sparse"}
        ],
        "text_overlays": [],
        "constraints": {
            "no_text_in_image": True,
            "max_text_area_pct": 1.0,
            "background_must_be_white": False,
            "no_person": True,
            "no_props": False,
        },
    }
)


async def test_executor_returns_valid_scene_spec():
    client = CannedSceneClient([VALID_SPEC_JSON])
    router = ModelRouter(clients={"sparkcode": client})
    executor = SceneJsonExecutor(router)
    budget = CostBudget(cap_usd=Decimal("1"))

    spec = await executor.generate(
        user_intent="夏季清凉感, 户外, 暖色调",
        product_metadata={"category": "apparel", "name": "Linen Dress"},
        constraints=Constraints(no_text_in_image=True, no_person=True),
        budget=budget,
    )

    assert spec.background.value == "outdoor summer garden"
    assert spec.product.preserve_fidelity is True
    assert spec.constraints.no_text_in_image is True
    assert budget.spent_usd == Decimal("0.02")


async def test_executor_retries_on_invalid_json():
    """First attempt returns garbage → executor asks again → second succeeds."""
    client = CannedSceneClient(["not valid json", VALID_SPEC_JSON])
    router = ModelRouter(clients={"sparkcode": client})
    executor = SceneJsonExecutor(router, max_retries=1)
    budget = CostBudget(cap_usd=Decimal("1"))

    spec = await executor.generate(
        user_intent="anything",
        budget=budget,
    )
    assert spec.background.value == "outdoor summer garden"
    # Both attempts billed
    assert budget.spent_usd == Decimal("0.04")


async def test_executor_raises_after_max_retries_exhausted():
    client = CannedSceneClient(["bad", "still bad"])
    router = ModelRouter(clients={"sparkcode": client})
    executor = SceneJsonExecutor(router, max_retries=1)
    budget = CostBudget(cap_usd=Decimal("1"))

    with pytest.raises(ModelInvalidResponse):
        await executor.generate(user_intent="x", budget=budget)


async def test_executor_user_message_contains_constraints():
    """Constraints should be in the user message so the LLM sees them."""
    captured: list[str] = []

    class CapturingClient(CannedSceneClient):
        async def chat(self, req: ChatRequest) -> ChatResponse:
            captured.append(req.messages[-1].content)
            return await super().chat(req)

    client = CapturingClient([VALID_SPEC_JSON])
    router = ModelRouter(clients={"sparkcode": client})
    executor = SceneJsonExecutor(router)
    budget = CostBudget(cap_usd=Decimal("1"))

    await executor.generate(
        user_intent="x",
        constraints=Constraints(no_text_in_image=True, background_must_be_white=True),
        budget=budget,
    )

    assert "no_text_in_image" in captured[0]
    assert "background_must_be_white" in captured[0]
