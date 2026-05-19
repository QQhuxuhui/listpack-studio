"""D11 ModelRouter tests — selection, budget, fallback chain."""

from __future__ import annotations

from decimal import Decimal

import pytest

from models import (
    ChatMessage,
    ChatRequest,
    CostBudget,
    ImageGenRequest,
    ModelBudgetExceeded,
    ModelRefused,
    ModelRouter,
    ModelUnavailable,
    RouterConfig,
)

from .conftest import MockModelClient


def _router(mock: MockModelClient, config: RouterConfig | None = None) -> ModelRouter:
    return ModelRouter(
        clients={"sparkcode": mock},
        config=config,
    )


def _chat_req(text: str = "hi") -> ChatRequest:
    return ChatRequest(
        model="(set-by-router)",
        messages=[ChatMessage(role="user", content=text)],
    )


# ─── selection ────────────────────────────────────────────────────


async def test_uses_configured_primary(mock_client):
    router = _router(mock_client)
    budget = CostBudget(cap_usd=Decimal("1"))

    res = await router.chat(_chat_req("hello"), budget=budget)

    # Default primary for chat is claude-sonnet-4-6
    assert mock_client.call_log == [("chat", "claude-sonnet-4-6")]
    assert "claude-sonnet-4-6" in res.text


async def test_model_hint_overrides_primary(mock_client):
    router = _router(mock_client)
    budget = CostBudget(cap_usd=Decimal("1"))

    res = await router.chat(_chat_req(), budget=budget, model_hint="gpt-4o")

    assert mock_client.call_log == [("chat", "gpt-4o")]
    assert "gpt-4o" in res.text


async def test_invalid_hint_falls_back_to_primary(mock_client):
    """Unknown / non-supporting hint should be ignored, not crash."""
    router = _router(mock_client)
    budget = CostBudget(cap_usd=Decimal("1"))

    # nano-banana doesn't do chat
    await router.chat(_chat_req(), budget=budget, model_hint="nano-banana")
    assert mock_client.call_log[0][1] == "claude-sonnet-4-6"


# ─── fallback chain ───────────────────────────────────────────────


async def test_fallback_when_primary_unavailable(mock_client):
    """primary down → first fallback used → call logged for both."""
    mock_client.fail_for_models = {"claude-sonnet-4-6"}
    router = _router(mock_client)
    budget = CostBudget(cap_usd=Decimal("1"))

    res = await router.chat(_chat_req(), budget=budget)

    # primary attempt + first fallback (gpt-4o)
    assert mock_client.call_log == [
        ("chat", "claude-sonnet-4-6"),
        ("chat", "gpt-4o"),
    ]
    assert "gpt-4o" in res.text


async def test_refusal_does_not_fall_back(mock_client):
    """Content refusal must NOT silently try another model."""
    mock_client.refused_models = {"claude-sonnet-4-6"}
    router = _router(mock_client)
    budget = CostBudget(cap_usd=Decimal("1"))

    with pytest.raises(ModelRefused):
        await router.chat(_chat_req(), budget=budget)

    # Only one call attempted
    assert mock_client.call_log == [("chat", "claude-sonnet-4-6")]


async def test_all_candidates_fail_raises_unavailable(mock_client):
    """Every candidate is down → final ModelUnavailable."""
    mock_client.fail_for_models = {
        "claude-sonnet-4-6",
        "gpt-4o",
        "claude-haiku-4-5",
        "gemini-2.5-pro",
    }
    router = _router(mock_client)
    budget = CostBudget(cap_usd=Decimal("1"))

    with pytest.raises(ModelUnavailable):
        await router.chat(_chat_req(), budget=budget)

    # Every chat-capable catalog model was tried (4 candidates)
    chat_calls = [m for (method, m) in mock_client.call_log if method == "chat"]
    assert "claude-sonnet-4-6" in chat_calls
    assert "gpt-4o" in chat_calls


# ─── budget enforcement ───────────────────────────────────────────


async def test_budget_reservation_blocks_overshoot(mock_client):
    """Cap is tighter than the cheapest model — must raise BEFORE the call."""
    router = _router(mock_client)
    budget = CostBudget(cap_usd=Decimal("0.001"))  # below any model's cost

    with pytest.raises(ModelBudgetExceeded):
        await router.chat(_chat_req(), budget=budget)

    # The router never even called the client
    assert mock_client.call_log == []


async def test_budget_records_actual_cost(mock_client):
    router = _router(mock_client)
    budget = CostBudget(cap_usd=Decimal("0.20"))

    await router.chat(_chat_req(), budget=budget)
    await router.chat(_chat_req(), budget=budget)

    # claude-sonnet-4-6 costs $0.02 per call
    assert budget.spent_usd == Decimal("0.04")
    assert budget.reserved_usd == Decimal("0")
    assert budget.remaining_usd == Decimal("0.16")


async def test_failed_call_releases_reservation(mock_client):
    """When a call fails, the reservation must be released so the next call
    can use that budget."""
    mock_client.fail_for_models = {"claude-sonnet-4-6"}
    router = _router(mock_client)
    budget = CostBudget(cap_usd=Decimal("0.05"))  # tight enough to matter

    # primary down → fallback succeeds; only the fallback's cost should land
    await router.chat(_chat_req(), budget=budget)

    assert budget.reserved_usd == Decimal("0")
    # gpt-4o costs $0.02 per the catalog
    assert budget.spent_usd == Decimal("0.02")


# ─── image_gen path uses different fallback chain ────────────────


async def test_image_gen_uses_image_chain(mock_client):
    router = _router(mock_client)
    budget = CostBudget(cap_usd=Decimal("1"))

    req = ImageGenRequest(model="(set-by-router)", prompt="a cat", n=2)
    res = await router.image_gen(req, budget=budget)

    # primary image_gen is nano-banana, default cost $0.039 * n=2 = $0.078
    assert mock_client.call_log == [("image_gen", "nano-banana")]
    assert len(res.images) == 2
    assert budget.spent_usd == Decimal("0.078")
