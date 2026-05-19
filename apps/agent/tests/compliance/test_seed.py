"""D9 integration test: seed → DB → reload → engine round-trip.

Needs POSTGRES_URL. Skips the module if unset.

Strategy: we don't write anything new — assumes the dev DB was already
seeded (run `uv run python -m compliance.rules.seed` first). We pull rules
back out, rebuild RuleSpec objects, and verify the engine still rejects an
obviously bad image. This closes the loop between the declarative
RuleSpec lists and what's actually executable from Postgres.
"""

from __future__ import annotations

import io
import os
from pathlib import Path

import pytest

PG_URL = os.environ.get("POSTGRES_URL")
if not PG_URL:
    pytest.skip(
        "POSTGRES_URL not set; D9 round-trip test requires the dev DB",
        allow_module_level=True,
    )

import psycopg  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402

# Patch parsing: psycopg returns JSONB as Python dict for plain `jsonb` cols,
# but it returns text for some Postgres versions. The seed schema uses jsonb
# so dict_row + automatic JSON decoding works out of the box for our case.
from PIL import Image  # noqa: E402

from compliance.engine import run_compliance_check  # noqa: E402
from compliance.rules.seed import from_db_row  # noqa: E402
from compliance.schemas import OverallStatus, RuleSeverity  # noqa: E402


def _load_rules_from_db(platform: str) -> list:
    with psycopg.connect(PG_URL) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM platform_rules "
                "WHERE platform = %s AND superseded_at IS NULL "
                "ORDER BY rule_key",
                (platform,),
            )
            rows = cur.fetchall()
    return [from_db_row(r) for r in rows]


# ─── round-trip the rule shape ───────────────────────────────────────


def test_seed_round_trip_preserves_shape():
    """Every Amazon rule pulled from DB rebuilds into a valid RuleSpec."""
    rules = _load_rules_from_db("amazon")
    assert len(rules) >= 13, f"expected ≥13 Amazon rules in DB, got {len(rules)}"

    for r in rules:
        # detector_type stripped from spec.detector_type, lifted onto field
        assert r.detector_type, f"{r.rule_key} missing detector_type"
        # severity is a proper enum
        assert r.severity in (
            RuleSeverity.block,
            RuleSeverity.warn,
            RuleSeverity.info,
        ), r.rule_key
        # bilingual messages survive JSONB round-trip
        assert "en" in r.display_message and "zh" in r.display_message, r.rule_key


# ─── engine works on DB-loaded rules ─────────────────────────────────


def _white_jpeg(width: int = 2000, height: int = 2000) -> tuple[bytes, str]:
    img = Image.new("RGB", (width, height), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue(), "image/jpeg"


def _tiny_image(width: int = 400, height: int = 400) -> tuple[bytes, str]:
    img = Image.new("RGB", (width, height), (200, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue(), "image/jpeg"


def test_engine_rejects_tiny_image_with_db_rules():
    """A 400×400 image should fail Amazon's dimension_min rule loaded from DB."""
    rules = _load_rules_from_db("amazon")
    # Filter to D4-only detectors (no OCR / DETR) so the test is fast + offline
    fast_detectors = {
        "pixel_dimension",
        "file_size",
        "file_format",
        "color_space",
        "background_color",
        "border_detection",
        "halo_edge",
        "shadow_intensity",
        "product_fill_ratio",
    }
    fast_rules = [r for r in rules if r.detector_type in fast_detectors]

    img, mime = _tiny_image()
    report = run_compliance_check(img, mime, fast_rules, target_platform="amazon")

    failed_keys = {r.rule_key for r in report.rule_results if not r.passed}
    assert "amazon.main_image.dimension_min" in failed_keys, failed_keys
    assert report.overall is OverallStatus.fail


def test_db_rules_distribution():
    """Sanity-check the seeded rule counts per platform."""
    expected_minimums = {
        "amazon": 13,
        "shopify": 4,
        "ebay": 4,
        "temu": 5,
        "shein": 3,
        "global": 5,  # category-scoped rules use platform='global'
    }
    for platform, expected_min in expected_minimums.items():
        rules = _load_rules_from_db(platform)
        assert len(rules) >= expected_min, (
            f"{platform}: expected ≥{expected_min} rules in DB, "
            f"got {len(rules)}. Run `uv run python -m compliance.rules.seed`."
        )
