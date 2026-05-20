"""D28 quota enforcement + usage_records tests.

- Unit-level (no DB) tests for can_charge math + runner gate via stub.
- PG-level (skipped without POSTGRES_URL) tests for end-to-end snapshot →
  record_usage cycle.
"""

from __future__ import annotations

import json
import os
import uuid as _uuid
from decimal import Decimal

import pytest

from runtime.listing_pack_runner import run_listing_pack_streamed
from runtime.quota import (
    PLAN_CATALOG,
    QuotaExceeded,
    QuotaSnapshot,
    SubscriptionMissing,
)


# ─── plan catalog math ──────────────────────────────────────────


def test_plan_catalog_has_all_pg_enum_plans():
    """Catalog must cover every value in the planEnum (free..enterprise)."""
    for plan in ("free", "starter", "pro", "brand", "agency", "enterprise"):
        assert plan in PLAN_CATALOG


def test_free_disallows_overage():
    snap = QuotaSnapshot(
        workspace_id="w1", plan="free", sku_quota=5, sku_used=5, overage_enabled=True
    )
    # Overage flag is set, but free plan has no overage rate → still blocked.
    assert snap.can_charge(1) is False


def test_pro_within_quota_allowed():
    snap = QuotaSnapshot(
        workspace_id="w1", plan="pro", sku_quota=100, sku_used=42, overage_enabled=False
    )
    assert snap.can_charge(1) is True
    assert snap.remaining == 58
    assert snap.in_overage is False


def test_pro_quota_exhausted_overage_off_blocked():
    snap = QuotaSnapshot(
        workspace_id="w1", plan="pro", sku_quota=100, sku_used=100, overage_enabled=False
    )
    assert snap.can_charge(1) is False
    assert snap.in_overage is True


def test_pro_quota_exhausted_overage_on_allowed():
    snap = QuotaSnapshot(
        workspace_id="w1", plan="pro", sku_quota=100, sku_used=120, overage_enabled=True
    )
    assert snap.can_charge(1) is True


def test_pro_batch_partly_over_blocked_without_overage():
    """Quota = 100, used = 95, asking for 10. Without overage → False."""
    snap = QuotaSnapshot(
        workspace_id="w1", plan="pro", sku_quota=100, sku_used=95, overage_enabled=False
    )
    assert snap.can_charge(10) is False
    snap.overage_enabled = True  # type: ignore[misc]
    # With overage enabled and pro plan supporting overage → True.
    assert snap.can_charge(10) is True


# ─── runner integration via stubs (no DB) ─────────────────────


def _parse_sse_data(frame: dict) -> dict:
    return json.loads(frame["data"])


async def test_runner_emits_quota_exceeded_and_skips(mocked_services, fixture_jpeg):
    src_bytes, src_mime = fixture_jpeg

    def _resolver(_lp: str) -> str:
        return "ws-1"

    def _checker(workspace_id: str, *, sku_count: int = 1):
        raise QuotaExceeded(
            workspace_id=workspace_id,
            plan="free",
            sku_quota=5,
            sku_used=5,
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
        listing_pack_id="lp-quota",
        persist=True,
        persist_create=lambda **_: "fake-run-id",
        persist_update=lambda *_a, **_k: None,
        persist_step=lambda **_: "fake-step",
        enforce_quota=True,
        quota_resolver=_resolver,
        quota_checker=_checker,
    ):
        events.append(sse)

    assert len(events) == 1
    assert events[0]["event"] == "run.quota_exceeded"
    data = _parse_sse_data(events[0])
    assert data["plan"] == "free"
    assert data["sku_used"] == 5


async def test_runner_emits_quota_unavailable_on_missing_subscription(
    mocked_services, fixture_jpeg
):
    src_bytes, src_mime = fixture_jpeg

    def _resolver(_lp: str) -> str:
        raise SubscriptionMissing("listing_pack X has no workspace subscription")

    def _checker(*_a, **_k):
        raise AssertionError("checker shouldn't run if resolver failed")

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
        listing_pack_id="lp-orphan",
        persist=True,
        persist_create=lambda **_: "fake-run-id",
        persist_update=lambda *_a, **_k: None,
        persist_step=lambda **_: "fake-step",
        enforce_quota=True,
        quota_resolver=_resolver,
        quota_checker=_checker,
    ):
        events.append(sse)

    assert events[-1]["event"] == "run.quota_unavailable"


async def test_runner_records_usage_after_successful_run(
    mocked_services, fixture_jpeg
):
    src_bytes, src_mime = fixture_jpeg

    snap = QuotaSnapshot(
        workspace_id="ws-1", plan="pro", sku_quota=100, sku_used=42, overage_enabled=False
    )

    usage_calls: list[dict] = []

    def _resolver(_lp: str) -> str:
        return "ws-1"

    def _checker(workspace_id: str, *, sku_count: int = 1):
        return snap

    def _recorder(**kwargs) -> str:
        usage_calls.append(kwargs)
        return "usage-1"

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
        listing_pack_id="lp-ok",
        persist=True,
        persist_create=lambda **_: "fake-run-id",
        persist_update=lambda *_a, **_k: None,
        persist_step=lambda **_: "fake-step",
        enforce_quota=True,
        quota_resolver=_resolver,
        quota_checker=_checker,
        usage_recorder=_recorder,
    ):
        events.append(sse)

    assert events[-1]["event"] == "run.completed"
    assert len(usage_calls) == 1
    call = usage_calls[0]
    assert call["workspace_id"] == "ws-1"
    assert call["event"] == "sku_generated"
    assert call["quantity"] == 1
    assert call["listing_pack_id"] == "lp-ok"


async def test_runner_records_overage_when_already_over_quota(
    mocked_services, fixture_jpeg
):
    """If snapshot says sku_used >= sku_quota, the recorder writes sku_overage."""
    src_bytes, src_mime = fixture_jpeg

    snap = QuotaSnapshot(
        workspace_id="ws-1",
        plan="pro",
        sku_quota=100,
        sku_used=120,
        overage_enabled=True,
    )
    usage_calls: list[dict] = []

    async for _ in run_listing_pack_streamed(
        mocked_services,
        input_={
            "run_id": "x",
            "source_image_bytes": src_bytes,
            "source_image_mime": src_mime,
            "target_platforms": ["amazon"],
            "cost_cap_usd": "1.00",
        },
        listing_pack_id="lp-over",
        persist=True,
        persist_create=lambda **_: "fake-run-id",
        persist_update=lambda *_a, **_k: None,
        persist_step=lambda **_: "fake-step",
        enforce_quota=True,
        quota_resolver=lambda _lp: "ws-1",
        quota_checker=lambda workspace_id, *, sku_count=1: snap,
        usage_recorder=lambda **k: (usage_calls.append(k), "u")[1],
    ):
        pass

    assert len(usage_calls) == 1
    assert usage_calls[0]["event"] == "sku_overage"


# ─── PG-backed quota end-to-end (skip without DB) ───────────────


PG_URL = os.environ.get("POSTGRES_URL")
if not PG_URL:
    pytest.skip(
        "POSTGRES_URL not set; D28 PG quota test requires the dev DB",
        allow_module_level=True,
    )

import psycopg  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402

from runtime.quota import (  # noqa: E402
    check_quota,
    get_workspace_quota,
    record_usage,
    reset_sku_used,
    resolve_workspace_for_listing_pack,
)


def _ensure_workspace_chain() -> tuple[str, str, str]:
    """Return (workspace_id, user_id, listing_pack_id), creating new rows.

    Cleans up by truncating the listing_packs row (cascade kills assets +
    agent_runs + usage_records).
    """
    with psycopg.connect(PG_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM workspaces LIMIT 1")
            ws = cur.fetchone()
            cur.execute("SELECT id FROM users LIMIT 1")
            usr = cur.fetchone()
            if not ws or not usr:
                pytest.skip("dev DB needs at least one workspace + user seeded")
            ws_id = str(ws[0])
            user_id = str(usr[0])

            asset_id = str(_uuid.uuid4())
            pack_id = str(_uuid.uuid4())
            cur.execute(
                """
                INSERT INTO assets
                  (id, workspace_id, uploader_user_id, type, mime, file_size, hash, storage_key)
                VALUES (%s, %s, %s, 'source_photo', 'image/jpeg', 100, %s, 'test/d28')
                """,
                (asset_id, ws_id, user_id, "cafebabe" * 8),
            )
            cur.execute(
                """
                INSERT INTO listing_packs
                  (id, workspace_id, name, source_asset_id, target_platforms)
                VALUES (%s, %s, 'd28-test', %s, ARRAY['amazon'])
                """,
                (pack_id, ws_id, asset_id),
            )
    return ws_id, user_id, pack_id


def _set_subscription(workspace_id: str, *, plan: str, quota: int, used: int, overage: bool = False) -> None:
    """Force a subscription row into a known state for testing."""
    from datetime import datetime, timedelta, timezone

    period_end = datetime.now(timezone.utc) + timedelta(days=30)
    with psycopg.connect(PG_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM subscriptions WHERE workspace_id = %s",
                (workspace_id,),
            )
            cur.execute(
                """
                INSERT INTO subscriptions
                  (id, workspace_id, plan, status, current_period_end,
                   sku_quota, sku_used, overage_enabled)
                VALUES (%s, %s, %s, 'active', %s, %s, %s, %s)
                """,
                (
                    str(_uuid.uuid4()),
                    workspace_id,
                    plan,
                    period_end,
                    quota,
                    used,
                    overage,
                ),
            )


def _cleanup_workspace_chain(ws_id: str, pack_id: str) -> None:
    with psycopg.connect(PG_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM listing_packs WHERE id = %s", (pack_id,))
            cur.execute(
                "DELETE FROM subscriptions WHERE workspace_id = %s",
                (ws_id,),
            )


@pytest.fixture
def pg_chain():
    ws_id, user_id, pack_id = _ensure_workspace_chain()
    yield ws_id, user_id, pack_id
    _cleanup_workspace_chain(ws_id, pack_id)


def test_pg_resolve_and_get_quota(pg_chain):
    ws_id, _user_id, pack_id = pg_chain
    _set_subscription(ws_id, plan="pro", quota=100, used=42)
    resolved = resolve_workspace_for_listing_pack(pack_id)
    assert resolved == ws_id

    snap = get_workspace_quota(ws_id)
    assert snap.plan == "pro"
    assert snap.sku_quota == 100
    assert snap.sku_used == 42
    assert snap.remaining == 58


def test_pg_check_quota_passes_within_limits(pg_chain):
    ws_id, _user_id, _pack_id = pg_chain
    _set_subscription(ws_id, plan="starter", quota=30, used=10)
    snap = check_quota(ws_id, sku_count=1)
    assert snap.sku_used == 10


def test_pg_check_quota_rejects_free_at_limit(pg_chain):
    ws_id, _user_id, _pack_id = pg_chain
    _set_subscription(ws_id, plan="free", quota=5, used=5, overage=True)
    with pytest.raises(QuotaExceeded):
        check_quota(ws_id, sku_count=1)


def test_pg_record_usage_increments_sku_used(pg_chain):
    ws_id, _user_id, pack_id = pg_chain
    _set_subscription(ws_id, plan="pro", quota=100, used=42)

    rec_id = record_usage(
        workspace_id=ws_id,
        event="sku_generated",
        quantity=1,
        unit_cost_usd=Decimal("0.078"),
        listing_pack_id=pack_id,
    )
    assert rec_id

    with psycopg.connect(PG_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT sku_used FROM subscriptions WHERE workspace_id = %s",
                (ws_id,),
            )
            assert cur.fetchone()[0] == 43

            cur.execute(
                "SELECT event, quantity, unit_cost_usd, listing_pack_id "
                "FROM usage_records WHERE id = %s",
                (rec_id,),
            )
            row = cur.fetchone()
            assert row[0] == "sku_generated"
            assert row[1] == 1
            assert row[2] == Decimal("0.0780")
            assert str(row[3]) == pack_id


def test_pg_reset_sku_used(pg_chain):
    ws_id, _user_id, _pack_id = pg_chain
    _set_subscription(ws_id, plan="pro", quota=100, used=87)
    reset_sku_used(ws_id)
    snap = get_workspace_quota(ws_id)
    assert snap.sku_used == 0


def test_pg_resolve_unknown_listing_pack_raises():
    with pytest.raises(SubscriptionMissing):
        resolve_workspace_for_listing_pack(str(_uuid.uuid4()))
