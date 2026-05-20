"""D24 PG-backed persistence smoke test.

Requires POSTGRES_URL + already-seeded workspace/user chain in the dev DB.
Creates a one-shot listing_pack row, runs an agent_run row through the
create / update / step / read cycle, then deletes everything via the
listing_packs cascade.
"""

from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest

PG_URL = os.environ.get("POSTGRES_URL")
if not PG_URL:
    pytest.skip(
        "POSTGRES_URL not set; D24 persistence smoke test requires the dev DB",
        allow_module_level=True,
    )

import psycopg  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402

from runtime.persistence import (  # noqa: E402
    create_agent_run,
    get_agent_run,
    insert_agent_step,
    list_agent_steps,
    update_agent_run,
)


def _first_existing_listing_pack_id() -> str | None:
    """Return any listing_packs.id we can FK to; tests skip if none exist."""
    with psycopg.connect(PG_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM listing_packs LIMIT 1")
            row = cur.fetchone()
    if row is None:
        return None
    return str(row[0])


def _create_fixture_listing_pack() -> str | None:
    """Build a throwaway listing_pack chain (workspace → user → asset → pack).

    Returns the pack id, or None if any FK precondition is missing (e.g.
    no workspaces exist yet).
    """
    with psycopg.connect(PG_URL) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
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
                VALUES (%s, %s, %s, 'source_photo', 'image/jpeg', 100, %s, 'test/d24')
                """,
                (asset_id, ws["id"], usr["id"], "deadbeef" * 8),
            )
            cur.execute(
                """
                INSERT INTO listing_packs
                  (id, workspace_id, name, source_asset_id, target_platforms)
                VALUES (%s, %s, 'd24-test', %s, ARRAY['amazon'])
                """,
                (pack_id, ws["id"], asset_id),
            )
    return pack_id


def _cleanup_listing_pack(pack_id: str) -> None:
    with psycopg.connect(PG_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM listing_packs WHERE id = %s", (pack_id,))


@pytest.fixture
def listing_pack_id():
    """Build a fresh listing_pack just for this test; clean up afterwards."""
    pack = _create_fixture_listing_pack()
    if pack is None:
        existing = _first_existing_listing_pack_id()
        if existing is None:
            pytest.skip("no workspaces/listing_packs available — seed app first")
        yield existing
        return
    yield pack
    _cleanup_listing_pack(pack)


def test_create_update_step_get_roundtrip(listing_pack_id):
    run_id = create_agent_run(
        listing_pack_id=listing_pack_id,
        cost_cap_usd=Decimal("0.50"),
        status="pending",
        plan={"render_scene": True},
    )
    try:
        update_agent_run(
            run_id,
            status="running",
            current_step="plan",
            cost_spent_usd=Decimal("0.02"),
        )

        step_id = insert_agent_step(
            agent_run_id=run_id,
            step_name="plan",
            status="completed",
            executor_name="plan",
            outputs={"render_scene": True, "cost_usd": "0.02"},
            started_at=datetime.now(timezone.utc),
            ended_at=datetime.now(timezone.utc),
        )
        assert step_id

        update_agent_run(
            run_id,
            status="completed",
            ended_at=datetime.now(timezone.utc),
            cost_spent_usd=Decimal("0.05"),
        )

        record = get_agent_run(run_id)
        assert record is not None
        assert record.id == run_id
        assert record.status == "completed"
        assert record.current_step == "plan"
        assert record.cost_spent_usd == Decimal("0.0500")
        assert record.plan == {"render_scene": True}
        assert record.ended_at is not None

        steps = list_agent_steps(run_id)
        assert len(steps) == 1
        assert steps[0].step_name == "plan"
        assert steps[0].status == "completed"
    finally:
        # explicit cleanup so failures don't pollute the dev DB
        with psycopg.connect(PG_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM agent_runs WHERE id = %s", (run_id,))


def test_get_agent_run_returns_none_for_unknown_id():
    fake_id = str(_uuid.uuid4())
    assert get_agent_run(fake_id) is None
