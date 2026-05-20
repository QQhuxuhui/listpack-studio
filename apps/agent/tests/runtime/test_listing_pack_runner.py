"""D24 listing_pack_runner — SSE stream + persistence stubs."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from decimal import Decimal

import pytest

from runtime.listing_pack_runner import run_listing_pack_streamed
from runtime.persistence import state_to_jsonb_safe


# ─── persistence stubs (capture calls without Postgres) ────────


class StubPersistence:
    """Captures persist_create / update / step calls so tests can assert order."""

    def __init__(self) -> None:
        self.runs: dict[str, dict] = {}
        self.steps: list[dict] = []
        self.creates: list[dict] = []
        self.updates: list[dict] = []

    def create(self, *, listing_pack_id, cost_cap_usd, status="pending", plan=None) -> str:
        rid = f"stub-run-{len(self.creates) + 1}"
        self.creates.append(
            {
                "id": rid,
                "listing_pack_id": listing_pack_id,
                "cost_cap_usd": cost_cap_usd,
                "status": status,
            }
        )
        self.runs[rid] = {
            "id": rid,
            "listing_pack_id": listing_pack_id,
            "status": status,
            "plan": plan,
            "cost_spent_usd": Decimal("0"),
        }
        return rid

    def update(self, run_id, **kw) -> None:
        self.updates.append({"id": run_id, **kw})
        self.runs[run_id].update(kw)

    def step(self, **kw) -> str:
        sid = f"step-{len(self.steps) + 1}"
        self.steps.append({"id": sid, **kw})
        return sid


# ─── SSE shape ──────────────────────────────────────────────────


def _parse_sse_data(frame: dict) -> dict:
    return json.loads(frame["data"])


async def test_run_emits_run_started_then_steps_then_run_completed(
    mocked_services, fixture_jpeg
):
    src_bytes, src_mime = fixture_jpeg
    stub = StubPersistence()

    events = []
    async for sse in run_listing_pack_streamed(
        mocked_services,
        input_={
            "run_id": "ignored-by-runner",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "1.00",
        },
        listing_pack_id="lp-1",
        persist=True,
        persist_create=stub.create,
        persist_update=stub.update,
        persist_step=stub.step,
    ):
        events.append(sse)

    # exactly one started + one completed; many step.completed in the middle
    assert events[0]["event"] == "run.started"
    assert events[-1]["event"] == "run.completed"
    step_events = [e for e in events if e["event"] == "step.completed"]
    assert len(step_events) >= 5  # plan + compliance + scene + image + refine + platform + c2pa

    # run_started carries run_id + listing_pack_id
    started = _parse_sse_data(events[0])
    assert started["listing_pack_id"] == "lp-1"
    assert started["run_id"].startswith("stub-run-")
    assert started["target_platforms"] == ["amazon"]

    # final event carries terminal status + counts
    completed = _parse_sse_data(events[-1])
    assert completed["status"] == "completed"
    assert int(completed["platform_outputs_count"]) >= 1
    assert int(completed["stamped_images_count"]) >= 1


async def test_persistence_writes_create_updates_and_steps(mocked_services, fixture_jpeg):
    src_bytes, src_mime = fixture_jpeg
    stub = StubPersistence()

    async for _ in run_listing_pack_streamed(
        mocked_services,
        input_={
            "run_id": "x",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "1.00",
        },
        listing_pack_id="lp-1",
        persist=True,
        persist_create=stub.create,
        persist_update=stub.update,
        persist_step=stub.step,
    ):
        pass

    # one create, many updates, one step per node
    assert len(stub.creates) == 1
    assert stub.creates[0]["listing_pack_id"] == "lp-1"

    # at least the terminal update sets status=completed
    terminal = [u for u in stub.updates if u.get("status") == "completed"]
    assert len(terminal) == 1
    assert "ended_at" in terminal[0]

    # steps cover all the nodes
    step_names = [s["step_name"] for s in stub.steps]
    for required in ("plan", "compliance_check", "scene_json", "image_gen", "platform_adapt", "c2pa_stamp"):
        assert required in step_names, f"missing {required} in {step_names}"


async def test_persistence_disabled_uses_synthetic_run_id(mocked_services, fixture_jpeg):
    src_bytes, src_mime = fixture_jpeg
    stub = StubPersistence()  # never invoked

    events = []
    async for sse in run_listing_pack_streamed(
        mocked_services,
        input_={
            "run_id": "x",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "1.00",
        },
        listing_pack_id="lp-1",
        persist=False,
        persist_create=stub.create,
        persist_update=stub.update,
        persist_step=stub.step,
    ):
        events.append(sse)

    assert events[0]["event"] == "run.started"
    started = _parse_sse_data(events[0])
    # synthetic uuid4, not "stub-run-*"
    assert not started["run_id"].startswith("stub-run-")
    # no persistence side-effects
    assert stub.creates == []
    assert stub.updates == []
    assert stub.steps == []


async def test_run_failed_when_graph_raises(mocked_services, fixture_jpeg, monkeypatch):
    """If graph.astream raises, runner emits run.failed and persists failure."""
    from graphs.listing_pack import graph as graph_mod

    src_bytes, src_mime = fixture_jpeg
    stub = StubPersistence()

    real_build = graph_mod.build_graph

    def _broken(_services):
        compiled = real_build(_services)

        class _BrokenGraph:
            async def astream(self, *args, **kw):
                if False:
                    yield None
                raise RuntimeError("simulated graph crash")

        return _BrokenGraph()

    monkeypatch.setattr(
        "runtime.listing_pack_runner.build_graph", _broken
    )

    events = []
    async for sse in run_listing_pack_streamed(
        mocked_services,
        input_={
            "run_id": "x",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "1.00",
        },
        listing_pack_id="lp-1",
        persist=True,
        persist_create=stub.create,
        persist_update=stub.update,
        persist_step=stub.step,
    ):
        events.append(sse)

    assert events[-1]["event"] == "run.failed"
    err = _parse_sse_data(events[-1])
    assert "simulated graph crash" in (err.get("error") or {}).get("message", "")
    # terminal update marks failed
    fails = [u for u in stub.updates if u.get("status") == "failed"]
    assert fails, "should have at least one failed update"


# ─── state_to_jsonb_safe ────────────────────────────────────────


def test_state_to_jsonb_safe_strips_bytes():
    state = {
        "run_id": "r1",
        "source_image_bytes": b"\xff\xd8large-jpeg-bytes",
        "scene_image_bytes": b"\x89PNG\r\n",
        "scene_prompt": "studio shot",
        "cost_spent_usd": Decimal("0.078"),
    }
    safe = state_to_jsonb_safe(state)
    # bytes replaced with placeholder dicts
    assert safe["source_image_bytes"] == {"_kind": "bytes_placeholder", "len": len(state["source_image_bytes"])}
    assert safe["scene_image_bytes"] == {"_kind": "bytes_placeholder", "len": 6}
    # non-bytes pass through; Decimal stringified
    assert safe["scene_prompt"] == "studio shot"
    assert safe["cost_spent_usd"] == "0.078"
    # must be JSON-serialisable
    json.dumps(safe)
