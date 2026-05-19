"""D5-D6 detector tests: product_fill_ratio / border / halo_edge / shadow_intensity."""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image, ImageDraw

from compliance.engine import run_compliance_check
from compliance.rules import AMAZON_RULES
from compliance.schemas import OverallStatus, RuleSeverity, RuleSpec


def _rule(key: str) -> RuleSpec:
    return next(r for r in AMAZON_RULES if r.rule_key == key)


# ─── product_fill_ratio ──────────────────────────────────────────────


def test_product_fill_pass_85pct(make_image):
    """Centred dark product covering 90% of frame → passes."""
    img_obj = Image.new("RGB", (2000, 2000), (255, 255, 255))
    d = ImageDraw.Draw(img_obj)
    margin = 100  # → product is 1800×1800 = 90% of 2000
    d.rectangle([margin, margin, 2000 - margin, 2000 - margin], fill=(40, 40, 40))
    buf = io.BytesIO()
    img_obj.save(buf, format="JPEG", quality=90)
    img_bytes = buf.getvalue()

    report = run_compliance_check(
        img_bytes, "image/jpeg",
        [_rule("amazon.main_image.product_fill_ratio")],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.pass_, report.rule_results[0].evidence
    ev = report.rule_results[0].evidence
    assert ev["fill_ratio"] >= 0.85


def test_product_fill_fail_50pct(make_image):
    """Small centred product covering 50% → fails."""
    img_obj = Image.new("RGB", (2000, 2000), (255, 255, 255))
    d = ImageDraw.Draw(img_obj)
    margin = 500  # product is 1000×1000 = 50%
    d.rectangle([margin, margin, 2000 - margin, 2000 - margin], fill=(40, 40, 40))
    buf = io.BytesIO()
    img_obj.save(buf, format="JPEG", quality=90)

    report = run_compliance_check(
        buf.getvalue(), "image/jpeg",
        [_rule("amazon.main_image.product_fill_ratio")],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.fail
    ev = report.rule_results[0].evidence
    assert ev["fill_ratio"] < 0.85
    assert report.fix_suggestions[0]["type"] == "crop_to_fill_ratio"


def test_product_fill_alpha_channel_mode():
    """RGBA image, alpha mask covers 95% → passes via alpha_channel method."""
    img_obj = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))  # fully transparent
    d = ImageDraw.Draw(img_obj)
    d.rectangle([25, 25, 975, 975], fill=(120, 120, 120, 255))  # 95% opaque
    buf = io.BytesIO()
    img_obj.save(buf, format="PNG")

    rule = RuleSpec(
        rule_key="test.fill_alpha",
        platform="amazon",
        applies_to_slot="main",
        detector_type="product_fill_ratio",
        spec={"min_ratio": 0.90, "method": "alpha_channel"},
        severity=RuleSeverity.block,
        display_title={"en": "x", "zh": "x"},
        display_message={"en": "x", "zh": "x"},
    )
    report = run_compliance_check(
        buf.getvalue(), "image/png", [rule], target_platform="amazon"
    )
    assert report.overall is OverallStatus.pass_, report.rule_results[0].evidence


def test_product_fill_sam_mode_surfaces_unimplemented():
    """sam_segmentation method should fail with explicit not-implemented hint."""
    img_obj = Image.new("RGB", (500, 500), (255, 255, 255))
    buf = io.BytesIO()
    img_obj.save(buf, format="JPEG")

    rule = RuleSpec(
        rule_key="test.fill_sam",
        platform="amazon",
        applies_to_slot="main",
        detector_type="product_fill_ratio",
        spec={"min_ratio": 0.85, "method": "sam_segmentation"},
        severity=RuleSeverity.warn,
        display_title={"en": "x", "zh": "x"},
        display_message={"en": "x", "zh": "x"},
    )
    report = run_compliance_check(
        buf.getvalue(), "image/jpeg", [rule], target_platform="amazon"
    )
    ev = report.rule_results[0].evidence
    assert "not yet implemented" in ev.get("error", "")
    assert ev.get("hint", "").startswith("configure REPLICATE_API_TOKEN")


# ─── border_detection ────────────────────────────────────────────────


def test_border_pass_clean(make_image):
    img, mime = make_image(
        width=1500, height=1500,
        background=(255, 255, 255),
        embed_logo=(80, 80, 80),
        format="JPEG",
    )
    report = run_compliance_check(
        img, mime, [_rule("amazon.main_image.no_border")], target_platform="amazon"
    )
    assert report.overall is OverallStatus.pass_, report.rule_results[0].evidence


def test_border_fail_coloured_frame():
    """60-px wide black frame around a 1500² image.

    Frame thickness must comfortably exceed `strip_pct * short_edge` (= 30 px
    with default 0.02) so the analysed edge strip lies entirely inside the
    frame and uniformity goes to 1.0.
    """
    img_obj = Image.new("RGB", (1500, 1500), (255, 255, 255))
    d = ImageDraw.Draw(img_obj)
    d.rectangle([0, 0, 1500, 60], fill=(0, 0, 0))
    d.rectangle([0, 1440, 1500, 1500], fill=(0, 0, 0))
    d.rectangle([0, 0, 60, 1500], fill=(0, 0, 0))
    d.rectangle([1440, 0, 1500, 1500], fill=(0, 0, 0))
    # dark product in the centre so the detector finds a real subject too
    d.rectangle([400, 400, 1100, 1100], fill=(120, 120, 120))
    buf = io.BytesIO()
    img_obj.save(buf, format="JPEG", quality=90)

    report = run_compliance_check(
        buf.getvalue(), "image/jpeg",
        [_rule("amazon.main_image.no_border")],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.fail
    ev = report.rule_results[0].evidence
    assert len(ev["coloured_border_strips"]) >= 1


# ─── halo_edge ───────────────────────────────────────────────────────


def test_halo_pass_clean_cutout():
    """Sharp clean alpha edge — no halo, should pass."""
    img_obj = Image.new("RGBA", (800, 800), (0, 0, 0, 0))
    d = ImageDraw.Draw(img_obj)
    d.rectangle([200, 200, 600, 600], fill=(80, 80, 80, 255))
    buf = io.BytesIO()
    img_obj.save(buf, format="PNG")

    report = run_compliance_check(
        buf.getvalue(), "image/png",
        [_rule("amazon.main_image.halo_edge_clean")],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.pass_, report.rule_results[0].evidence


def test_halo_not_applicable_for_rgb(make_image):
    img, mime = make_image(width=500, height=500, format="JPEG")
    report = run_compliance_check(
        img, mime,
        [_rule("amazon.main_image.halo_edge_clean")],
        target_platform="amazon",
    )
    # RGB images get a pass with `not_applicable` evidence
    assert report.overall is OverallStatus.pass_
    assert report.rule_results[0].evidence.get("not_applicable") is True


# ─── shadow_intensity ────────────────────────────────────────────────


def test_shadow_pass_light_image(make_image):
    img, mime = make_image(
        width=1000, height=1000,
        background=(255, 255, 255),
        embed_logo=(180, 180, 180),  # light product, no shadow
        format="JPEG",
    )
    report = run_compliance_check(
        img, mime,
        [_rule("amazon.main_image.shadow_not_heavy")],
        target_platform="amazon",
    )
    assert report.overall is OverallStatus.pass_, report.rule_results[0].evidence


def test_shadow_fail_dark_image():
    """Image with 40% dark pixels → should fail (warn severity → OverallStatus.warn)."""
    img_obj = Image.new("RGB", (1000, 1000), (255, 255, 255))
    d = ImageDraw.Draw(img_obj)
    # Fill ~40% of the image with very dark pixels
    d.rectangle([0, 0, 1000, 400], fill=(10, 10, 10))
    buf = io.BytesIO()
    img_obj.save(buf, format="JPEG", quality=90)

    report = run_compliance_check(
        buf.getvalue(), "image/jpeg",
        [_rule("amazon.main_image.shadow_not_heavy")],
        target_platform="amazon",
    )
    # warn severity → not block fail; overall lands on warn
    assert report.overall is OverallStatus.warn
    ev = report.rule_results[0].evidence
    assert ev["dark_pixel_pct"] > 0.20


# ─── engine: full Amazon set with D5-D6 rules ────────────────────────


def test_engine_full_amazon_v2_pass():
    """A well-formed 2000² product image passes the full 10-rule Amazon set."""
    img_obj = Image.new("RGB", (2000, 2000), (255, 255, 255))
    d = ImageDraw.Draw(img_obj)
    margin = 150  # product is 1700×1700 = 85% — right at the threshold
    d.rectangle([margin, margin, 2000 - margin, 2000 - margin], fill=(100, 100, 100))
    buf = io.BytesIO()
    img_obj.save(buf, format="JPEG", quality=88)

    report = run_compliance_check(
        buf.getvalue(), "image/jpeg", AMAZON_RULES, target_platform="amazon"
    )
    failed = [r for r in report.rule_results if not r.passed]
    assert report.overall is OverallStatus.pass_, (
        f"{len(failed)} rules failed: "
        f"{[(r.rule_key, r.evidence) for r in failed]}"
    )
