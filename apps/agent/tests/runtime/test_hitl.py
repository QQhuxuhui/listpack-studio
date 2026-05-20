"""D25 HITL tests — unit-level (cooperative interrupt) + PG-level (pause/cancel/fork)."""

from __future__ import annotations

import json
import os
import uuid as _uuid
from decimal import Decimal

import pytest

from runtime.hitl import (
    InvalidStateTransition,
    RunNotFound,
    cancel_run,
    fork_run,
    is_run_interrupted,
    pause_run,
    resume_run,
)
from runtime.listing_pack_runner import run_listing_pack_streamed


# ─── runner cooperative pause/cancel (unit, no DB) ─────────────


def _parse_sse_data(frame: dict) -> dict:
    return json.loads(frame["data"])


async def test_runner_honours_interrupt_after_first_step(mocked_services, fixture_jpeg):
    """interrupt_checker returns True after the very first poll → run.interrupted."""
    src_bytes, src_mime = fixture_jpeg

    calls = {"n": 0}

    def checker(_run_id: str) -> tuple[bool, str | None]:
        calls["n"] += 1
        # interrupt on the SECOND poll (first node completes, then pause kicks in)
        if calls["n"] >= 2:
            return (True, "paused")
        return (False, None)

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
        interrupt_checker=checker,
    ):
        events.append(sse)

    event_names = [e["event"] for e in events]
    assert "run.interrupted" in event_names
    # never completes — should NOT see run.completed
    assert "run.completed" not in event_names
    # at least 1 step before interruption
    step_count = event_names.count("step.completed")
    assert 1 <= step_count <= 7


async def test_runner_no_interrupt_runs_to_completion(mocked_services, fixture_jpeg):
    """Default no-op checker → run completes normally."""
    src_bytes, src_mime = fixture_jpeg

    def checker(_run_id: str) -> tuple[bool, str | None]:
        return (False, None)

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
        interrupt_checker=checker,
    ):
        events.append(sse)

    assert events[-1]["event"] == "run.completed"


# ─── PG-backed HITL (skip if no DB) ─────────────────────────────


PG_URL = os.environ.get("POSTGRES_URL")
if not PG_URL:
    pytest.skip(
        "POSTGRES_URL not set; D25 PG HITL tests need the dev DB",
        allow_module_level=True,
    )

import psycopg  # noqa: E402

from runtime.persistence import create_agent_run  # noqa: E402


def _create_fixture_listing_pack() -> str | None:
    """Build a throwaway listing_pack so the HITL tests have a FK target."""
    with psycopg.connect(PG_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM workspaces LIMIT 1")
            ws = cur.fetchone()
            cur.execute("SELECT id FROM users LIMIT 1")
            usr = cur.fetchone()
            if not ws or not usr:
                return None
            asset_id = str(_uuid.uuid4())
            pack_id = str(_uuid.uuid4())
            cur.execute(
                """
                INSERT INTO assets
                  (id, workspace_id, uploader_user_id, type, mime, file_size, hash, storage_key)
                VALUES (%s, %s, %s, 'source_photo', 'image/jpeg', 100, %s, 'test/d25')
                """,
                (asset_id, ws[0], usr[0], "feedbeef" * 8),
            )
            cur.execute(
                """
                INSERT INTO listing_packs
                  (id, workspace_id, name, source_asset_id, target_platforms)
                VALUES (%s, %s, 'd25-test', %s, ARRAY['amazon'])
                """,
                (pack_id, ws[0], asset_id),
            )
    return pack_id


@pytest.fixture
def pg_run_id():
    """Create a fresh pending agent_run row; clean up after the test."""
    pack_id = _create_fixture_listing_pack()
    if pack_id is None:
        pytest.skip("no workspaces/users in dev DB — seed the app first")

    run_id = create_agent_run(
        listing_pack_id=pack_id,
        cost_cap_usd=Decimal("0.50"),
        status="pending",
        plan={"render_scene": True},
    )
    yield run_id
    with psycopg.connect(PG_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM agent_runs WHERE id = %s", (run_id,))
            cur.execute("DELETE FROM listing_packs WHERE id = %s", (pack_id,))


def test_pause_then_resume_roundtrip(pg_run_id):
    assert pause_run(pg_run_id) == "paused"
    assert is_run_interrupted(pg_run_id) == (True, "paused")
    assert resume_run(pg_run_id) == "running"
    assert is_run_interrupted(pg_run_id) == (False, None)


def test_pause_terminal_run_rejected(pg_run_id):
    # Move to canceled (terminal)
    cancel_run(pg_run_id, reason="test")
    with pytest.raises(InvalidStateTransition):
        pause_run(pg_run_id)


def test_resume_non_paused_run_rejected(pg_run_id):
    # Just-created run is 'pending', not 'paused'
    with pytest.raises(InvalidStateTransition):
        resume_run(pg_run_id)


def test_cancel_writes_error_and_ended_at(pg_run_id):
    assert cancel_run(pg_run_id, reason="user changed their mind") == "canceled"
    with psycopg.connect(PG_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, error, ended_at FROM agent_runs WHERE id = %s",
                (pg_run_id,),
            )
            row = cur.fetchone()
    assert row[0] == "canceled"
    assert row[1] is not None
    assert row[1].get("type") == "user_canceled"
    assert row[2] is not None


def test_cancel_terminal_rejected(pg_run_id):
    cancel_run(pg_run_id)
    with pytest.raises(InvalidStateTransition):
        cancel_run(pg_run_id)


def test_fork_copies_plan_resets_state_and_cost(pg_run_id):
    new_id = fork_run(pg_run_id)
    try:
        with psycopg.connect(PG_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT status, plan, state, cost_spent_usd, listing_pack_id
                      FROM agent_runs WHERE id = %s
                    """,
                    (new_id,),
                )
                row = cur.fetchone()
        assert row[0] == "pending"
        assert row[1] == {"render_scene": True}
        assert row[2] is None  # fresh state
        assert row[3] == Decimal("0")
        # listing_pack_id is preserved
        with psycopg.connect(PG_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT listing_pack_id FROM agent_runs WHERE id = %s", (pg_run_id,))
                src_lp = cur.fetchone()[0]
        assert str(row[4]) == str(src_lp)
    finally:
        with psycopg.connect(PG_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM agent_runs WHERE id = %s", (new_id,))


def test_fork_with_overrides(pg_run_id):
    new_id = fork_run(
        pg_run_id,
        overrides={
            "plan": {"render_scene": False, "render_banner": True},
            "cost_cap_usd": Decimal("2.00"),
        },
    )
    try:
        with psycopg.connect(PG_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT plan, cost_cap_usd FROM agent_runs WHERE id = %s",
                    (new_id,),
                )
                row = cur.fetchone()
        assert row[0]["render_banner"] is True
        assert row[1] == Decimal("2.0000")
    finally:
        with psycopg.connect(PG_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM agent_runs WHERE id = %s", (new_id,))


def test_fork_unknown_run_raises():
    with pytest.raises(RunNotFound):
        fork_run(str(_uuid.uuid4()))


def test_pause_unknown_run_raises():
    with pytest.raises(RunNotFound):
        pause_run(str(_uuid.uuid4()))
