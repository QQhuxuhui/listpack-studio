"""D7 OCR detector tests: text_in_image + category_forbidden_text.

These tests pay PaddleOCR's ~10s warmup on first call. We skip the file
entirely if paddleocr isn't installed so D4-D6 contributors can still
run the suite quickly.
"""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFont

pytest.importorskip("paddleocr", reason="OCR tests require paddleocr install")

from compliance.engine import run_compliance_check  # noqa: E402
from compliance.rules import AMAZON_RULES, CATEGORY_RULES  # noqa: E402
from compliance.schemas import OverallStatus, RuleSeverity, RuleSpec  # noqa: E402


# ─── shared helpers ──────────────────────────────────────────────────


def _pick_font(size: int) -> ImageFont.ImageFont:
    """Return a TrueType font likely to be installed on Linux CI.

    Falls back to PIL's bitmap default (low quality — OCR may struggle) only
    if no TTF is found.
    """
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for p in candidates:
        if Path(p).is_file():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size=size)


def _make_image_with_text(
    text: str,
    *,
    width: int = 1500,
    height: int = 1500,
    font_size: int = 90,
    text_color: tuple[int, int, int] = (0, 0, 0),
    background: tuple[int, int, int] = (255, 255, 255),
) -> tuple[bytes, str]:
    img = Image.new("RGB", (width, height), background)
    d = ImageDraw.Draw(img)
    font = _pick_font(font_size)

    # Centre the text within a single line. For multi-line, splits on '\n'.
    lines = text.split("\n")
    line_height = font_size + 12
    total_h = line_height * len(lines)
    y = (height - total_h) // 2
    for line in lines:
        try:
            bbox = d.textbbox((0, 0), line, font=font)
            text_w = bbox[2] - bbox[0]
        except AttributeError:
            text_w = font_size * len(line) // 2
        x = (width - text_w) // 2
        d.text((x, y), line, fill=text_color, font=font)
        y += line_height

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue(), "image/jpeg"


def _make_blank_image(
    *,
    width: int = 1500,
    height: int = 1500,
    embed_product: bool = True,
) -> tuple[bytes, str]:
    img = Image.new("RGB", (width, height), (255, 255, 255))
    if embed_product:
        d = ImageDraw.Draw(img)
        m = width // 5
        d.rectangle([m, m, width - m, height - m], fill=(110, 110, 110))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue(), "image/jpeg"


def _rule_amazon(key: str) -> RuleSpec:
    return next(r for r in AMAZON_RULES if r.rule_key == key)


def _rule_category(key: str) -> RuleSpec:
    return next(r for r in CATEGORY_RULES if r.rule_key == key)


# ─── text_in_image ───────────────────────────────────────────────────


def test_text_in_image_pass_on_blank():
    """Blank white image with a centred grey product — no text → passes."""
    img, mime = _make_blank_image()
    report = run_compliance_check(
        img, mime,
        [_rule_amazon("amazon.main_image.no_text")],
        target_platform="amazon",
    )
    ev = report.rule_results[0].evidence
    assert report.overall is OverallStatus.pass_, ev
    assert ev["detected_text_count"] == 0


def test_text_in_image_fail_on_promo_overlay():
    """Image with 'SALE 50% OFF' overlay → fails (Amazon main_image.no_text)."""
    img, mime = _make_image_with_text("SALE 50% OFF", font_size=120)
    report = run_compliance_check(
        img, mime,
        [_rule_amazon("amazon.main_image.no_text")],
        target_platform="amazon",
    )
    ev = report.rule_results[0].evidence
    assert report.overall is OverallStatus.fail, ev
    assert ev["detected_text_count"] >= 1
    assert any(
        "SALE" in h["text"].upper() or "OFF" in h["text"].upper()
        for h in ev["detected_text"]
    ), ev


# ─── category_forbidden_text ─────────────────────────────────────────


def test_category_supplements_passes_safe_phrase():
    """Supplement image with a generic non-medical caption → passes."""
    img, mime = _make_image_with_text(
        "Multi Vitamin\nDaily Support",
        font_size=80,
    )
    rule = _rule_category("category.supplements.no_medical_claims")
    report = run_compliance_check(
        img, mime, [rule], target_platform="amazon",
        target_category="supplements",
    )
    ev = report.rule_results[0].evidence
    assert report.overall is OverallStatus.pass_, ev
    assert ev["matched_count"] == 0


def test_category_cosmetics_fail_on_wrinkle_reduction():
    """Cosmetic image with 'wrinkle reduction' → fails the regulated-claim rule."""
    img, mime = _make_image_with_text("Wrinkle Reduction", font_size=110)
    rule = _rule_category("category.cosmetics.no_disease_claims")
    report = run_compliance_check(
        img, mime, [rule], target_platform="amazon",
        target_category="cosmetics",
    )
    ev = report.rule_results[0].evidence
    assert report.overall is OverallStatus.fail, ev
    matched_keywords = {m["keyword"].lower() for m in ev["matches"]}
    assert "wrinkle reduction" in matched_keywords, ev


def test_category_forbidden_text_custom_keyword_list():
    """Detector works with an ad-hoc keyword list (not just seeded rules)."""
    img, mime = _make_image_with_text("Limited Edition", font_size=100)
    rule = RuleSpec(
        rule_key="test.custom_keyword_check",
        platform="global",
        applies_to_slot="any",
        applies_to_category=["any"],
        detector_type="category_forbidden_text",
        spec={
            "keywords": ["limited edition", "exclusive offer"],
            "min_confidence": 0.5,
        },
        severity=RuleSeverity.warn,
        display_title={"en": "x", "zh": "x"},
        display_message={"en": "x", "zh": "x"},
    )
    report = run_compliance_check(img, mime, [rule], target_platform="amazon")
    ev = report.rule_results[0].evidence
    assert report.overall is OverallStatus.warn, ev
    assert ev["matched_count"] >= 1
