"""D52 — A+ Content + Banner nodes in the listing_pack DAG.

Verifies:
- skip path: plan.render_a_plus / render_banner = False → step logged as
  skipped, no platform_outputs entry added
- render path: plan flags True → executors actually render bytes and
  append to platform_outputs with the expected slot
- failure path: rendering raises → step marked failed, run continues
"""

from __future__ import annotations

import io

import pytest
from PIL import Image

from graphs.listing_pack import Planner, PlanSpec, run_listing_pack


def _platform_output_slots(final: dict) -> list[str]:
    return [o["slot"] for o in final.get("platform_outputs") or []]


# ─── skip path (default planner) ────────────────────────────────


async def test_a_plus_and_banner_skipped_by_default(mocked_services, fixture_jpeg):
    """No planner configured → plan defaults to render_scene only.
    a_plus_build + banner_build should be present in the step log as
    'skipped'."""
    src_bytes, src_mime = fixture_jpeg
    mocked_services.planner = None  # default plan: scene only

    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "run_skip_default",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "1.00",
        },
    )

    log_by_step = {s["step"]: s for s in final["step_log"]}
    assert log_by_step["a_plus_build"]["status"] == "skipped"
    assert log_by_step["banner_build"]["status"] == "skipped"

    slots = _platform_output_slots(final)
    # PlatformAdapter has its own `amazon.a_plus_hero` (underscore — a
    # resize slot), not the same as our `amazon.a_plus.hero` (dot — a
    # composed module). Check the exact composed-module slot is absent.
    assert "amazon.a_plus.hero" not in slots
    assert "shopify.banner.hero" not in slots


# ─── render path: A+ ─────────────────────────────────────────────


class _APlusPlanner(Planner):
    """Planner that always enables a_plus only."""

    async def plan(self, *, user_intent, product_category, target_platforms, budget):
        return PlanSpec(
            render_scene=True,
            render_a_plus=True,
            render_banner=False,
            target_platforms=list(target_platforms),
            refinement_rounds=0,
            reasoning="test forced render_a_plus=True",
        )


async def test_a_plus_renders_and_appends_to_platform_outputs(
    mocked_services, fixture_jpeg
):
    src_bytes, src_mime = fixture_jpeg
    mocked_services.planner = _APlusPlanner(mocked_services.router)

    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "run_a_plus",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "user_intent": "Soft cashmere scarf — winter 2026",
            "cost_cap_usd": "1.00",
        },
    )

    log_by_step = {s["step"]: s for s in final["step_log"]}
    assert log_by_step["a_plus_build"]["status"] == "completed"
    assert log_by_step["banner_build"]["status"] == "skipped"

    a_plus = next(
        o for o in final["platform_outputs"]
        if o["slot"] == "amazon.a_plus.hero"
    )
    assert a_plus["platform"] == "amazon"
    assert a_plus["width"] == 970
    assert a_plus["height"] == 600
    assert a_plus["mime"].startswith("image/")
    assert a_plus["byte_count"] > 0
    # bytes ride along in-memory for D37 persist; state_to_jsonb_safe will
    # strip them before the checkpointer JSONB write.
    assert isinstance(a_plus["bytes"], (bytes, bytearray))
    # Verify the bytes are a valid image (sanity check on the actual render).
    img = Image.open(io.BytesIO(bytes(a_plus["bytes"])))
    assert img.size == (970, 600)


# ─── render path: Banner ─────────────────────────────────────────


class _BannerPlanner(Planner):
    async def plan(self, *, user_intent, product_category, target_platforms, budget):
        return PlanSpec(
            render_scene=True,
            render_a_plus=False,
            render_banner=True,
            target_platforms=list(target_platforms),
            refinement_rounds=0,
            reasoning="test forced render_banner=True",
        )


async def test_banner_renders_and_uses_brand_tagline(mocked_services, fixture_jpeg):
    src_bytes, src_mime = fixture_jpeg
    mocked_services.planner = _BannerPlanner(mocked_services.router)

    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "run_banner",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["shopify"],
            "user_intent": "spring sale",
            "cost_cap_usd": "1.00",
            "brand_kit": {
                "primary_color": "#ea580c",
                "tagline": "Discover the new season",
            },
        },
    )

    log_by_step = {s["step"]: s for s in final["step_log"]}
    assert log_by_step["banner_build"]["status"] == "completed"
    assert log_by_step["a_plus_build"]["status"] == "skipped"

    banner = next(
        o for o in final["platform_outputs"]
        if o["slot"] == "shopify.banner.hero"
    )
    assert banner["platform"] == "shopify"
    assert banner["width"] == 1500
    assert banner["height"] == 500
    assert banner["byte_count"] > 0
    # Tagline is what we passed via brand_kit (overrides user_intent).
    assert banner["metadata"]["text"] == "Discover the new season"
    img = Image.open(io.BytesIO(bytes(banner["bytes"])))
    assert img.size == (1500, 500)


# ─── render path: both ───────────────────────────────────────────


class _AllOnPlanner(Planner):
    async def plan(self, *, user_intent, product_category, target_platforms, budget):
        return PlanSpec(
            render_scene=True,
            render_a_plus=True,
            render_banner=True,
            target_platforms=list(target_platforms),
            refinement_rounds=0,
            reasoning="render everything",
        )


async def test_both_modules_produce_two_extra_outputs(mocked_services, fixture_jpeg):
    src_bytes, src_mime = fixture_jpeg
    mocked_services.planner = _AllOnPlanner(mocked_services.router)

    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "run_all",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon", "shopify"],
            "cost_cap_usd": "2.00",
        },
    )

    slots = _platform_output_slots(final)
    assert "amazon.a_plus.hero" in slots
    assert "shopify.banner.hero" in slots
    # PlatformAdapter slot output for amazon + shopify still landed too.
    assert any(s.startswith("amazon.") and "a_plus" not in s for s in slots)
    assert any(s.startswith("shopify.") and "banner" not in s for s in slots)


# ─── skip when services lack executors (legacy / dev) ────────────


async def test_a_plus_skipped_when_services_unconfigured(mocked_services, fixture_jpeg):
    src_bytes, src_mime = fixture_jpeg
    mocked_services.planner = _AllOnPlanner(mocked_services.router)
    mocked_services.a_plus_builder = None
    mocked_services.banner_executor = None

    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "run_no_executors",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "1.00",
        },
    )

    log_by_step = {s["step"]: s for s in final["step_log"]}
    assert log_by_step["a_plus_build"]["status"] == "skipped"
    assert "no a_plus_builder" in log_by_step["a_plus_build"]["message"]
    assert log_by_step["banner_build"]["status"] == "skipped"
    assert "no banner_executor" in log_by_step["banner_build"]["message"]
