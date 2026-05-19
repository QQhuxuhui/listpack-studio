"""Seed `platform_rules` table from declarative RuleSpec lists.

Run via:
    uv run python -m compliance.rules.seed                 # all rule sets
    uv run python -m compliance.rules.seed --platform amazon

Schema reuse (no DB migration needed):
The TypeScript `platform_rules.spec JSONB` carries detector params. We pack
detector_type INTO the JSONB blob as `{"detector_type": "...", **params}` so
the same SQL schema works without adding a column. `from_db_row()` round-trips
back to RuleSpec.

Upsert by (rule_key, version): re-seeding is idempotent; bumping a rule's
`version` creates a new row, preserving history for old ComplianceReports.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import uuid
from typing import Iterable

import psycopg

try:
    # uuid_utils is a langgraph transitive dep already on disk; gives us v7 ids
    # that match what apps/web (Drizzle + uuidv7) generates. Falls back to v4
    # if not installed — both are valid UUIDs and Drizzle doesn't care which.
    import uuid_utils as _uuid_utils  # type: ignore[import-untyped]

    def _new_id() -> str:
        return str(_uuid_utils.uuid7())
except ImportError:

    def _new_id() -> str:
        return str(uuid.uuid4())

from ..schemas import RuleSpec
from . import (
    AMAZON_RULES,
    ALL_RULES,
    CATEGORY_RULES,
    EBAY_RULES,
    SHEIN_RULES,
    SHOPIFY_RULES,
    TEMU_RULES,
)

logger = logging.getLogger("listpack.compliance.seed")

# ── packing / unpacking detector_type ────────────────────────────────


def _pack_spec(rule: RuleSpec) -> dict:
    """Bundle detector_type INTO the spec JSONB so schema doesn't need a new column."""
    blob = dict(rule.spec)
    blob["detector_type"] = rule.detector_type
    return blob


def _derive_rule_type(detector_type: str) -> str:
    """Map detector_type → platform_rule_type enum.

    enum is just a high-level bucket for catalog browsing; if detector is text/OCR
    it's text_content, if it's category-scoped it's category_specific, else it's
    image_property. The detector itself is the runtime dispatch key.
    """
    if detector_type in ("text_in_image", "category_forbidden_text"):
        return "text_content"
    if detector_type == "category_forbidden_text":  # category-scoped form
        return "category_specific"
    return "image_property"


def from_db_row(row: dict) -> RuleSpec:
    """Reverse of _pack_spec — used by loaders that pull rules from Postgres."""
    spec_blob = dict(row["spec"])
    detector_type = spec_blob.pop("detector_type")
    return RuleSpec(
        rule_key=row["rule_key"],
        platform=row["platform"],
        applies_to_slot=row.get("applies_to_slot") or "any",
        applies_to_category=row.get("applies_to_category"),
        detector_type=detector_type,
        spec=spec_blob,
        severity=row["severity"],
        auto_fix=row.get("auto_fix"),
        display_title=row["display_title"],
        display_message=row["display_message"],
        fix_cta=row.get("fix_cta"),
        version=row.get("version", 1),
        source_url=row.get("source_url"),
    )


# ── upsert ───────────────────────────────────────────────────────────


UPSERT_SQL = """
INSERT INTO platform_rules (
    id, rule_key, platform, applies_to_slot, applies_to_category,
    rule_type, spec, severity, auto_fix,
    display_title, display_message, fix_cta,
    version, source_url, source_type, last_verified_at
) VALUES (
    %(id)s::uuid,
    %(rule_key)s, %(platform)s, %(applies_to_slot)s, %(applies_to_category)s,
    %(rule_type)s::platform_rule_type,
    %(spec)s::jsonb,
    %(severity)s::compliance_severity,
    %(auto_fix)s::jsonb,
    %(display_title)s::jsonb,
    %(display_message)s::jsonb,
    %(fix_cta)s::jsonb,
    %(version)s, %(source_url)s, %(source_type)s, NOW()
)
ON CONFLICT (rule_key, version) DO UPDATE SET
    platform              = EXCLUDED.platform,
    applies_to_slot       = EXCLUDED.applies_to_slot,
    applies_to_category   = EXCLUDED.applies_to_category,
    rule_type             = EXCLUDED.rule_type,
    spec                  = EXCLUDED.spec,
    severity              = EXCLUDED.severity,
    auto_fix              = EXCLUDED.auto_fix,
    display_title         = EXCLUDED.display_title,
    display_message       = EXCLUDED.display_message,
    fix_cta               = EXCLUDED.fix_cta,
    source_url            = EXCLUDED.source_url,
    source_type           = EXCLUDED.source_type,
    last_verified_at      = NOW()
"""


def _to_row_params(rule: RuleSpec) -> dict:
    return {
        "id": _new_id(),
        "rule_key": rule.rule_key,
        "platform": rule.platform,
        "applies_to_slot": rule.applies_to_slot,
        "applies_to_category": rule.applies_to_category,
        "rule_type": _derive_rule_type(rule.detector_type),
        "spec": json.dumps(_pack_spec(rule)),
        "severity": rule.severity.value,
        "auto_fix": json.dumps(rule.auto_fix) if rule.auto_fix else None,
        "display_title": json.dumps(rule.display_title),
        "display_message": json.dumps(rule.display_message),
        "fix_cta": json.dumps(rule.fix_cta) if rule.fix_cta else None,
        "version": rule.version,
        "source_url": rule.source_url,
        "source_type": "platform_official",
    }


def upsert_rules(conn: psycopg.Connection, rules: Iterable[RuleSpec]) -> int:
    """Upsert each rule by (rule_key, version). Returns number processed."""
    count = 0
    with conn.cursor() as cur:
        for rule in rules:
            cur.execute(UPSERT_SQL, _to_row_params(rule))
            count += 1
    return count


# ── CLI ──────────────────────────────────────────────────────────────


PLATFORM_SETS = {
    "amazon": AMAZON_RULES,
    "shopify": SHOPIFY_RULES,
    "ebay": EBAY_RULES,
    "temu": TEMU_RULES,
    "shein": SHEIN_RULES,
    "category": CATEGORY_RULES,
    "all": ALL_RULES,
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed platform_rules table.")
    parser.add_argument(
        "--platform",
        choices=sorted(PLATFORM_SETS.keys()),
        default="all",
        help="Which rule set to seed (default: all).",
    )
    parser.add_argument(
        "--postgres-url",
        default=os.environ.get("POSTGRES_URL"),
        help="Postgres connection string (defaults to $POSTGRES_URL).",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    rules = PLATFORM_SETS[args.platform]
    logger.info("seeding %d rules (set=%s)", len(rules), args.platform)

    if args.dry_run:
        for r in rules:
            print(f"  {r.rule_key:60s} v{r.version}  [{r.severity.value}]")
        return 0

    if not args.postgres_url:
        print("ERROR: --postgres-url or $POSTGRES_URL required", file=sys.stderr)
        return 2

    with psycopg.connect(args.postgres_url) as conn:
        n = upsert_rules(conn, rules)
        conn.commit()
        print(f"✓ upserted {n} rules into platform_rules (set={args.platform})")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    sys.exit(main())
