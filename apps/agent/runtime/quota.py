"""Quota enforcement + usage tracking — mirror of lib/payments/plans.ts.

PRD § 00 § 5.1:
- Free:      5 SKU / month, NO overage allowed
- Starter:   30 SKU / month, $0.80 / SKU overage
- Pro:       100 SKU / month, $0.50 / SKU overage
- Brand:     500 SKU / month, $0.30 / SKU overage
- Agency:    2500 SKU / month, $0.20 / SKU overage
- Enterprise: custom (skuQuota=0 stored; allow_overage defaults True)

Flow (D28):
1. Agent receives /v1/agent/listing-pack/runs (listing_pack_id given)
2. Resolve workspace_id via listing_packs.workspace_id
3. check_quota(workspace_id, sku_count=1) — raises QuotaExceeded if over
4. After run.completed → record_usage(workspace_id, ...) writes usage_records
   row + UPDATE subscriptions.sku_used += sku_count

Keep this in sync with apps/web/lib/payments/plans.ts::PLAN_CATALOG —
the TS file is the canonical source for marketing, but the agent service
needs the numbers locally to enforce without an HTTP round-trip.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

import psycopg
from psycopg.rows import dict_row

logger = logging.getLogger("listpack.runtime.quota")


# ─── plan catalog (keep in sync with lib/payments/plans.ts) ────


@dataclass(frozen=True)
class PlanLimits:
    plan_id: str
    sku_quota: int
    overage_per_sku_usd: Decimal | None  # None = overage forbidden


PLAN_CATALOG: dict[str, PlanLimits] = {
    "free":       PlanLimits("free",       5,    None),
    "starter":    PlanLimits("starter",    30,   Decimal("0.80")),
    "pro":        PlanLimits("pro",        100,  Decimal("0.50")),
    "brand":      PlanLimits("brand",      500,  Decimal("0.30")),
    "agency":     PlanLimits("agency",     2500, Decimal("0.20")),
    "enterprise": PlanLimits("enterprise", 0,    None),  # custom-quoted; skip gate
}


# ─── exceptions ─────────────────────────────────────────────────


class QuotaError(Exception):
    """Base for quota-related rejections."""


class QuotaExceeded(QuotaError):
    """Workspace's SKU quota is exhausted and overage isn't allowed."""

    def __init__(self, *, workspace_id: str, plan: str, sku_quota: int, sku_used: int) -> None:
        super().__init__(
            f"workspace {workspace_id} exceeded {plan} quota "
            f"({sku_used}/{sku_quota} SKUs used)"
        )
        self.workspace_id = workspace_id
        self.plan = plan
        self.sku_quota = sku_quota
        self.sku_used = sku_used


class SubscriptionMissing(QuotaError):
    """No subscription row for this workspace — caller should refuse."""


# ─── snapshot reader ────────────────────────────────────────────


@dataclass
class QuotaSnapshot:
    workspace_id: str
    plan: str
    sku_quota: int
    sku_used: int
    overage_enabled: bool

    @property
    def remaining(self) -> int:
        return max(self.sku_quota - self.sku_used, 0)

    @property
    def in_overage(self) -> bool:
        return self.sku_used >= self.sku_quota

    def can_charge(self, sku_count: int) -> bool:
        """True if this many SKUs can be billed (quota OR overage allowed)."""
        if self.sku_used + sku_count <= self.sku_quota:
            return True
        if self.overage_enabled and self.plan in PLAN_CATALOG:
            return PLAN_CATALOG[self.plan].overage_per_sku_usd is not None
        return False


def _postgres_url() -> str:
    url = os.environ.get("POSTGRES_URL")
    if not url:
        raise RuntimeError(
            "POSTGRES_URL not set; cannot enforce quota."
        )
    return url


def get_workspace_quota(workspace_id: str) -> QuotaSnapshot:
    """Read the current quota state for a workspace.

    Raises SubscriptionMissing if no row exists.
    """
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT plan, sku_quota, sku_used, overage_enabled
                  FROM subscriptions
                 WHERE workspace_id = %s
                 LIMIT 1
                """,
                (workspace_id,),
            )
            row = cur.fetchone()
    if row is None:
        raise SubscriptionMissing(
            f"no subscription row for workspace {workspace_id}"
        )
    return QuotaSnapshot(
        workspace_id=workspace_id,
        plan=row["plan"],
        sku_quota=row["sku_quota"],
        sku_used=row["sku_used"],
        overage_enabled=row["overage_enabled"],
    )


def resolve_workspace_for_listing_pack(listing_pack_id: str) -> str:
    """Map listing_pack_id → workspace_id via the listing_packs FK."""
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT workspace_id FROM listing_packs WHERE id = %s",
                (listing_pack_id,),
            )
            row = cur.fetchone()
    if row is None:
        raise SubscriptionMissing(
            f"listing_pack {listing_pack_id} not found"
        )
    return str(row[0])


# ─── enforcement ────────────────────────────────────────────────


def check_quota(workspace_id: str, *, sku_count: int = 1) -> QuotaSnapshot:
    """Raise QuotaExceeded if the workspace can't run another sku_count SKUs.

    Returns the snapshot on success so the caller can decide whether to charge
    a normal SKU or an overage SKU when recording usage.
    """
    snap = get_workspace_quota(workspace_id)
    if not snap.can_charge(sku_count):
        raise QuotaExceeded(
            workspace_id=workspace_id,
            plan=snap.plan,
            sku_quota=snap.sku_quota,
            sku_used=snap.sku_used,
        )
    return snap


# ─── usage_records writes ───────────────────────────────────────


UsageEvent = Literal[
    "sku_generated",
    "sku_overage",
    "scene_image",
    "a_plus",
    "compliance_check",
    "platform_export",
]


def record_usage(
    *,
    workspace_id: str,
    event: UsageEvent,
    quantity: int = 1,
    unit_cost_usd: Decimal | None = None,
    listing_pack_id: str | None = None,
    agent_run_id: str | None = None,
    metadata: dict | None = None,
    increment_sku_used: bool = True,
) -> str:
    """Insert a usage_records row + (optionally) bump subscriptions.sku_used.

    The increment is conditional so non-billable events (compliance checks
    in the Free tier per PRD § 4.2) can still be recorded for analytics
    without consuming the user's quota.

    Returns the inserted usage_records.id.
    """
    from psycopg.types.json import Jsonb

    from .persistence import _new_id  # reuse the uuid7 helper

    rec_id = _new_id()
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO usage_records
                  (id, workspace_id, event, quantity, unit_cost_usd,
                   listing_pack_id, agent_run_id, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    rec_id,
                    workspace_id,
                    event,
                    quantity,
                    unit_cost_usd,
                    listing_pack_id,
                    agent_run_id,
                    Jsonb(metadata) if metadata is not None else None,
                ),
            )
            if increment_sku_used and event in ("sku_generated", "sku_overage"):
                cur.execute(
                    """
                    UPDATE subscriptions
                       SET sku_used = sku_used + %s,
                           updated_at = NOW()
                     WHERE workspace_id = %s
                    """,
                    (quantity, workspace_id),
                )
    return rec_id


def reset_sku_used(workspace_id: str) -> None:
    """Reset the rolling SKU counter — wired into Stripe's invoice.payment_succeeded
    webhook so the new billing period starts fresh."""
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE subscriptions
                   SET sku_used = 0,
                       current_period_start = NOW(),
                       updated_at = NOW()
                 WHERE workspace_id = %s
                """,
                (workspace_id,),
            )
