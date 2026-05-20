"""D19-D20 listing_pack graph tests.

Verifies the happy-path end-to-end:
  source jpeg → compliance → scene_json → image_gen → platform_adapt → c2pa_stamp
"""

from __future__ import annotations

import io
from decimal import Decimal

from PIL import Image

from graphs.listing_pack import (
    ListingPackStatus,
    build_graph,
    run_listing_pack,
)


# ─── happy path ──────────────────────────────────────────────────


async def test_happy_path_runs_to_completion(mocked_services, fixture_jpeg):
    source_bytes, source_mime = fixture_jpeg
    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "run_test_001",
            "source_image_bytes": source_bytes,
            "source_image_mime": source_mime,
            "target_platforms": ["amazon"],
            "target_category": None,
            "user_intent": "studio product shot",
            "cost_cap_usd": "0.50",
        },
    )

    assert final["status"] is ListingPackStatus.completed, final.get("error")
    assert final["current_step"] == "c2pa_stamp"
    assert final["error"] is None

    # every node logged a step (plan added in D21 — runs first)
    steps = [s["step"] for s in final["step_log"]]
    assert steps == [
        "plan",
        "compliance_check",
        "scene_json",
        "image_gen",
        "platform_adapt",
        "c2pa_stamp",
    ]

    # scene_json + image_gen both spent budget
    assert Decimal(final["cost_spent_usd"]) > Decimal("0")

    # downstream artefacts populated
    assert final["scene_spec"] is not None
    assert final["scene_image_bytes"] is not None
    assert final["platform_outputs"], "platform_adapt should produce slot outputs"
    assert any("amazon" in p["slot"] for p in final["platform_outputs"])
    assert final["stamped_images"], "c2pa_stamp should populate stamped_images"


# ─── multi-platform fan-out (still single image source) ──────────


async def test_multi_platform_target_produces_more_slots(mocked_services, fixture_jpeg):
    source_bytes, source_mime = fixture_jpeg
    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "run_test_multi",
            "source_image_bytes": source_bytes,
            "source_image_mime": source_mime,
            "target_platforms": ["amazon", "shopify", "temu"],
            "cost_cap_usd": "1.00",
        },
    )

    assert final["status"] is ListingPackStatus.completed
    slots = {p["slot"] for p in final["platform_outputs"]}
    assert any(s.startswith("amazon.") for s in slots)
    assert any(s.startswith("shopify.") for s in slots)
    assert any(s.startswith("temu.") for s in slots)


# ─── streaming via astream ───────────────────────────────────────


async def test_astream_emits_per_node_updates(mocked_services, fixture_jpeg):
    """Graph.astream surfaces a state update per executed node.

    SSE wire-up in D24 turns each of these into one event/data frame.
    """
    source_bytes, source_mime = fixture_jpeg
    graph = build_graph(mocked_services)

    from graphs.listing_pack.state import make_initial_state

    initial = make_initial_state(
        {
            "run_id": "run_stream",
            "source_image_bytes": source_bytes,
            "source_image_mime": source_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "0.50",
        }
    )
    node_names_seen: list[str] = []
    async for update in graph.astream(initial, stream_mode="updates"):
        node_names_seen.extend(update.keys())

    assert node_names_seen == [
        "plan",
        "compliance_check",
        "scene_json",
        "image_gen",
        "platform_adapt",
        "c2pa_stamp",
    ]


# ─── failure isolation: scene_json error short-circuits to failed ──


async def test_scene_json_failure_marks_run_failed(
    mocked_services, mock_canned_client, fixture_jpeg
):
    """If the LLM is unreachable on every fallback, the run fails cleanly
    at that step and downstream nodes still execute (LangGraph's default
    behaviour) but inherit the failed status without crashing."""
    # All chat-capable models fail
    mock_canned_client.fail_for_models = {
        "claude-sonnet-4-6",
        "gpt-4o",
        "claude-haiku-4-5",
        "gemini-2.5-pro",
    }
    source_bytes, source_mime = fixture_jpeg
    final = await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "run_test_fail",
            "source_image_bytes": source_bytes,
            "source_image_mime": source_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "0.50",
        },
    )

    # The graph completes structurally (every node ran) but the SceneJson
    # node has flagged the run as failed. Subsequent nodes inherit the
    # missing-state failure (scene_spec / scene_image_bytes None) and
    # last-write-wins reduces the error to whichever node ran last.
    failed_steps = [s for s in final["step_log"] if s["status"] == "failed"]
    assert any(s["step"] == "scene_json" for s in failed_steps)
    assert final.get("error", {}).get("step") in {
        "scene_json",
        "image_gen",
        "platform_adapt",
        "c2pa_stamp",
    }


# ─── derived constraints flow source-failures → scene_spec ────────


async def test_derived_constraints_force_white_background(mocked_services, mock_canned_client):
    """When source compliance fails background_white, the SceneJson user
    message must include `background_must_be_white=true` so the LLM honours it."""
    # Synthesise a pretend compliance failure — we do this by stubbing
    # rules_loader to return a single failing rule
    from compliance.schemas import RuleSpec

    failing_rule = RuleSpec(
        rule_key="amazon.main_image.background_white",
        platform="amazon",
        applies_to_slot="main",
        detector_type="background_color",
        spec={"target_rgb": [255, 255, 255], "tolerance": 0},
        severity="block",  # type: ignore[arg-type]
        display_title={"en": "x", "zh": "x"},
        display_message={"en": "x", "zh": "x"},
    )
    mocked_services.rules_loader = lambda p, c=None: [failing_rule]

    # Tiny off-white image guaranteed to fail tolerance=0
    img = Image.new("RGB", (200, 200), (240, 240, 240))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    captured_user_messages: list[str] = []
    original_chat = mock_canned_client.chat

    async def _capture(req):  # type: ignore[no-untyped-def]
        captured_user_messages.append(req.messages[-1].content)
        return await original_chat(req)

    mock_canned_client.chat = _capture  # type: ignore[method-assign]

    await run_listing_pack(
        mocked_services,
        input_={
            "run_id": "run_constraints",
            "source_image_bytes": buf.getvalue(),
            "source_image_mime": "image/jpeg",
            "target_platforms": ["amazon"],
            "cost_cap_usd": "0.50",
        },
    )

    assert any("background_must_be_white" in m for m in captured_user_messages)
