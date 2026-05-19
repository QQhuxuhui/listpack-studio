"""D15 ImageExecutor + cache tests."""

from __future__ import annotations

from decimal import Decimal

import pytest

from generators import GeneratedImage, ImageExecutor, InMemoryImageCache
from generators.cache import compute_cache_key
from models import CostBudget, ModelRouter
from scene_spec import (
    Background,
    BackgroundType,
    Product,
    SceneSpec,
)
from tests.models.conftest import MockModelClient


def _spec(**kw) -> SceneSpec:
    defaults = dict(
        background=Background(type=BackgroundType.solid, value="#FFFFFF"),
        product=Product(asset_ref="asset_test"),
    )
    defaults.update(kw)
    return SceneSpec(**defaults)


def _executor(client: MockModelClient | None = None) -> tuple[ImageExecutor, MockModelClient, InMemoryImageCache]:
    client = client or MockModelClient()
    router = ModelRouter(clients={"sparkcode": client})
    cache = InMemoryImageCache()
    return ImageExecutor(router=router, cache=cache), client, cache


# ─── cache key ────────────────────────────────────────────────────


def test_cache_key_stable_for_identical_inputs():
    a = compute_cache_key("model-x", "a prompt", 1024, 1024, None, 1)
    b = compute_cache_key("model-x", "a prompt", 1024, 1024, None, 1)
    assert a == b


def test_cache_key_changes_when_dims_change():
    a = compute_cache_key("model-x", "p", 1024, 1024, None, 1)
    b = compute_cache_key("model-x", "p", 2048, 1024, None, 1)
    assert a != b


# ─── happy path ───────────────────────────────────────────────────


async def test_generate_calls_router_on_miss():
    executor, client, cache = _executor()
    budget = CostBudget(cap_usd=Decimal("1"))

    res = await executor.generate(_spec(), budget=budget)

    assert isinstance(res, GeneratedImage)
    assert res.cache_hit is False
    assert client.call_log == [("image_gen", "nano-banana")]
    assert res.model_id == "nano-banana"
    assert cache.stats()["misses"] == 1


async def test_repeated_call_hits_cache_skipping_model():
    executor, client, cache = _executor()
    budget = CostBudget(cap_usd=Decimal("1"))

    a = await executor.generate(_spec(), budget=budget)
    b = await executor.generate(_spec(), budget=budget)

    assert a.cache_hit is False
    assert b.cache_hit is True
    # Only ONE model call (the first); cache hit saved the second
    assert len(client.call_log) == 1
    # Budget reflects only the first call's cost (~$0.039 for nano-banana)
    assert budget.spent_usd == Decimal("0.039")


# ─── cache busting ────────────────────────────────────────────────


async def test_different_seed_busts_cache():
    executor, client, _cache = _executor()
    budget = CostBudget(cap_usd=Decimal("1"))

    await executor.generate(_spec(), budget=budget, seed=1)
    await executor.generate(_spec(), budget=budget, seed=2)

    assert len(client.call_log) == 2


async def test_different_dims_busts_cache():
    executor, client, _cache = _executor()
    budget = CostBudget(cap_usd=Decimal("1"))

    await executor.generate(_spec(), budget=budget, width=1024, height=1024)
    await executor.generate(_spec(), budget=budget, width=1024, height=2048)

    assert len(client.call_log) == 2


async def test_different_model_hint_busts_cache():
    """Two specs identical in every way except model_hint → two model calls."""
    executor, client, _cache = _executor()
    budget = CostBudget(cap_usd=Decimal("1"))

    await executor.generate(_spec(), budget=budget, model_hint="nano-banana")
    await executor.generate(_spec(), budget=budget, model_hint="nano-banana-pro")

    assert len(client.call_log) == 2
    assert client.call_log[0][1] == "nano-banana"
    assert client.call_log[1][1] == "nano-banana-pro"


async def test_changed_spec_busts_cache():
    """Different background colours = different prompts = different cache keys."""
    executor, client, _cache = _executor()
    budget = CostBudget(cap_usd=Decimal("1"))

    spec1 = _spec(background=Background(type=BackgroundType.solid, value="#FFFFFF"))
    spec2 = _spec(background=Background(type=BackgroundType.solid, value="#000000"))

    await executor.generate(spec1, budget=budget)
    await executor.generate(spec2, budget=budget)

    assert len(client.call_log) == 2


# ─── cache hit doesn't touch budget ──────────────────────────────


async def test_cache_hit_does_not_charge_budget():
    executor, _client, _cache = _executor()
    budget = CostBudget(cap_usd=Decimal("0.05"))

    # First call eats nano-banana cost ($0.039)
    await executor.generate(_spec(), budget=budget)
    assert budget.spent_usd == Decimal("0.039")
    remaining_before = budget.remaining_usd

    # Second call must NOT bill — budget unchanged
    await executor.generate(_spec(), budget=budget)
    assert budget.spent_usd == Decimal("0.039")
    assert budget.remaining_usd == remaining_before


# ─── cache bounds ────────────────────────────────────────────────


async def test_in_memory_cache_evicts_over_capacity():
    cache = InMemoryImageCache(max_entries=2)
    from generators.cache import CachedImage

    await cache.put("a", CachedImage(b"1", "image/png", "m", "0", "a"))
    await cache.put("b", CachedImage(b"2", "image/png", "m", "0", "b"))
    await cache.put("c", CachedImage(b"3", "image/png", "m", "0", "c"))

    # FIFO eviction: 'a' should be gone
    assert (await cache.get("a")) is None
    assert (await cache.get("b")) is not None
    assert (await cache.get("c")) is not None


# ─── error path ──────────────────────────────────────────────────


async def test_model_error_does_not_pollute_cache():
    client = MockModelClient(fail_for_models={"nano-banana"})
    # Make fallback succeed
    executor = ImageExecutor(
        router=ModelRouter(clients={"sparkcode": client}),
        cache=InMemoryImageCache(),
    )
    budget = CostBudget(cap_usd=Decimal("1"))

    res = await executor.generate(_spec(), budget=budget)

    # Fallback `nano-banana-pro` should have served the call
    assert res.model_id == "nano-banana-pro"
    # The router tried 2 models; only the successful one was cached
    assert ("image_gen", "nano-banana") in client.call_log
    assert ("image_gen", "nano-banana-pro") in client.call_log
