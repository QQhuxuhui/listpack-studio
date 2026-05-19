"""Unit tests for D4 detectors + the Amazon main-image rule set.

Each detector gets a pair (passing case + failing case) plus a smoke test
of the engine end-to-end with the seeded Amazon rules.
"""

from __future__ import annotations

from compliance.engine import run_compliance_check
from compliance.rules import AMAZON_RULES
from compliance.schemas import OverallStatus, RuleSeverity, RuleSpec


# ── pixel_dimension ──────────────────────────────────────────────────


def test_pixel_dimension_pass(make_image):
    img, mime = make_image(width=2000, height=2000)
    report = run_compliance_check(
        img, mime, [r for r in AMAZON_RULES if r.rule_key == "amazon.main_image.dimension_min"],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.pass_
    assert report.rule_results[0].passed


def test_pixel_dimension_fail_too_small(make_image):
    img, mime = make_image(width=500, height=500)
    report = run_compliance_check(
        img, mime, [r for r in AMAZON_RULES if r.rule_key == "amazon.main_image.dimension_min"],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.fail
    assert not report.rule_results[0].passed
    assert report.rule_results[0].evidence["long_edge"] == 500
    assert report.fix_suggestions[0]["type"] == "resize"


# ── file_size ────────────────────────────────────────────────────────


def test_file_size_pass(make_image):
    img, mime = make_image(width=800, height=800)  # small jpeg
    report = run_compliance_check(
        img, mime, [r for r in AMAZON_RULES if r.rule_key == "amazon.main_image.file_size_max"],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.pass_


def test_file_size_fail_with_low_threshold(make_image):
    """Detector behaviour test — synthetic Amazon main images are tiny
    (solid-color JPEGs compress to <1MB even at 6000×6000), so we build an
    ad-hoc rule with a threshold below the actual file size to force a fail.
    """
    img, mime = make_image(width=2000, height=2000, quality=100)
    rule = RuleSpec(
        rule_key="test.file_size_low_cap",
        platform="amazon",
        applies_to_slot="main",
        detector_type="file_size",
        spec={"max_bytes": len(img) - 1},
        severity=RuleSeverity.block,
        display_title={"en": "test", "zh": "测试"},
        display_message={"en": "test", "zh": "测试"},
    )
    report = run_compliance_check(img, mime, [rule], target_platform="amazon")
    assert report.overall is OverallStatus.fail
    assert report.rule_results[0].evidence["actual_bytes"] == len(img)


# ── file_format ──────────────────────────────────────────────────────


def test_file_format_pass_jpeg(make_image):
    img, mime = make_image(format="JPEG")
    report = run_compliance_check(
        img, mime, [r for r in AMAZON_RULES if r.rule_key == "amazon.main_image.format"],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.pass_


def test_file_format_fail_webp(make_image):
    img, mime = make_image(format="WEBP")
    report = run_compliance_check(
        img, mime, [r for r in AMAZON_RULES if r.rule_key == "amazon.main_image.format"],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.fail
    assert report.rule_results[0].evidence["actual_mime"] == "image/webp"


# ── color_space ──────────────────────────────────────────────────────


def test_color_space_pass_rgb(make_image):
    img, mime = make_image(mode="RGB", format="PNG")
    report = run_compliance_check(
        img, mime, [r for r in AMAZON_RULES if r.rule_key == "amazon.main_image.color_space"],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.pass_


def test_color_space_fail_cmyk(make_image):
    # Pillow JPEG supports CMYK
    img, mime = make_image(mode="CMYK", format="JPEG", background=(0, 0, 0))
    report = run_compliance_check(
        img, mime, [r for r in AMAZON_RULES if r.rule_key == "amazon.main_image.color_space"],
        target_platform="amazon",
    )
    # CMYK is `warn` severity → overall is warn, not fail
    assert report.overall is OverallStatus.warn
    assert not report.rule_results[0].passed


# ── background_color ─────────────────────────────────────────────────


def test_background_color_pass_pure_white(make_image):
    img, mime = make_image(
        width=1500, height=1500,
        background=(255, 255, 255),
        embed_logo=(10, 10, 10),  # dark product in centre — edges still white
        format="PNG",
    )
    report = run_compliance_check(
        img, mime,
        [r for r in AMAZON_RULES if r.rule_key == "amazon.main_image.background_white"],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.pass_, report.rule_results[0].evidence


def test_background_color_fail_offwhite(make_image):
    img, mime = make_image(
        width=1500, height=1500,
        background=(248, 248, 250),  # just slightly off — Amazon rejects
        format="PNG",
    )
    report = run_compliance_check(
        img, mime,
        [r for r in AMAZON_RULES if r.rule_key == "amazon.main_image.background_white"],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.fail
    ev = report.rule_results[0].evidence
    assert ev["max_per_channel_deviation"] >= 5
    assert report.fix_suggestions[0]["type"] == "whiten_background"


# ── engine: full Amazon rule set ─────────────────────────────────────


def test_engine_full_amazon_pass(make_image):
    """Compliant image: 2000×2000, white BG, JPEG, RGB, well under 10MB."""
    img, mime = make_image(
        width=2000, height=2000,
        background=(255, 255, 255),
        embed_logo=(80, 80, 80),
        format="JPEG",
        quality=85,
    )
    report = run_compliance_check(
        img, mime, AMAZON_RULES, target_platform="amazon",
    )
    failed = [r for r in report.rule_results if not r.passed]
    assert report.overall is OverallStatus.pass_, (
        f"Should pass but {len(failed)} rules failed: "
        f"{[(r.rule_key, r.evidence) for r in failed]}"
    )


def test_engine_full_amazon_multiple_failures(make_image):
    """Pathological image: too small, off-white, wrong format."""
    img, mime = make_image(
        width=500, height=500,
        background=(245, 245, 245),
        format="WEBP",
    )
    report = run_compliance_check(
        img, mime, AMAZON_RULES, target_platform="amazon",
    )
    assert report.overall is OverallStatus.fail
    failed_keys = {r.rule_key for r in report.rule_results if not r.passed}
    assert "amazon.main_image.dimension_min" in failed_keys
    assert "amazon.main_image.format" in failed_keys
    assert "amazon.main_image.background_white" in failed_keys
