"""D12 fixer tests — close the loop with detectors.

For each fixer we:
1. Build an image that fails the corresponding detector.
2. Apply the fixer.
3. Re-run the detector on the fixed image; assert it now passes.

This is the only useful end-to-end shape for fixers — testing them in
isolation lets bugs through (e.g. fixer claims success but doesn't
actually change anything).
"""

from __future__ import annotations

import io

from PIL import Image, ImageDraw

from compliance.engine import run_compliance_check
from compliance.fixers import fixer_registry
from compliance.rules import AMAZON_RULES
from compliance.schemas import OverallStatus, RuleSpec


def _rule(key: str) -> RuleSpec:
    return next(r for r in AMAZON_RULES if r.rule_key == key)


def _check(image_bytes: bytes, mime: str, rule: RuleSpec) -> bool:
    """Return True iff the image passes the given rule."""
    report = run_compliance_check(
        image_bytes, mime, [rule], target_platform="amazon"
    )
    return report.overall is OverallStatus.pass_


def _jpeg(width: int, height: int, color=(255, 255, 255), quality: int = 90) -> tuple[bytes, str]:
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue(), "image/jpeg"


# ─── resize ─────────────────────────────────────────────────────────


def test_resize_fixes_dimension_min():
    img, mime = _jpeg(500, 500)
    rule = _rule("amazon.main_image.dimension_min")
    assert not _check(img, mime, rule)

    fixer = fixer_registry["resize"]
    result = fixer(img, mime, {"target_long_edge": 2000})

    assert max(*Image.open(io.BytesIO(result.bytes_out)).size) == 2000
    assert _check(result.bytes_out, result.mime_out, rule)


# ─── compress ───────────────────────────────────────────────────────


def test_compress_fixes_file_size_max():
    # Build an image that's actually big — random noise to defeat JPEG entropy
    import numpy as np

    rng = np.random.default_rng(42)
    arr = rng.integers(0, 256, size=(3000, 3000, 3), dtype=np.uint8)
    pil = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    pil.save(buf, format="JPEG", quality=100)
    big = buf.getvalue()
    assert len(big) > 10 * 1024 * 1024  # sanity — should be > 10MB

    rule = _rule("amazon.main_image.file_size_max")
    assert not _check(big, "image/jpeg", rule)

    fixer = fixer_registry["compress"]
    result = fixer(big, "image/jpeg", {"target_bytes": 8 * 1024 * 1024, "quality": 85})

    assert len(result.bytes_out) <= 10 * 1024 * 1024
    assert _check(result.bytes_out, result.mime_out, rule)


# ─── convert_format ─────────────────────────────────────────────────


def test_convert_format_webp_to_jpeg():
    img = Image.new("RGB", (500, 500), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=85)
    webp_bytes = buf.getvalue()

    rule = _rule("amazon.main_image.format")
    assert not _check(webp_bytes, "image/webp", rule)

    fixer = fixer_registry["convert_format"]
    result = fixer(webp_bytes, "image/webp", {"target_format": "jpeg"})

    assert result.mime_out == "image/jpeg"
    assert _check(result.bytes_out, result.mime_out, rule)


# ─── convert_color_space ────────────────────────────────────────────


def test_convert_color_space_cmyk_to_rgb():
    img = Image.new("CMYK", (500, 500), (0, 0, 0, 30))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    cmyk_bytes = buf.getvalue()

    rule = _rule("amazon.main_image.color_space")
    assert not _check(cmyk_bytes, "image/jpeg", rule)

    fixer = fixer_registry["convert_color_space"]
    result = fixer(cmyk_bytes, "image/jpeg", {"target": "srgb"})

    assert _check(result.bytes_out, result.mime_out, rule)


# ─── whiten_background ──────────────────────────────────────────────


def test_whiten_background_fixes_background_white():
    """Off-white (#f5f5f5) → snap to pure white."""
    img, mime = _jpeg(1500, 1500, color=(245, 245, 245))
    rule = _rule("amazon.main_image.background_white")
    assert not _check(img, mime, rule)

    fixer = fixer_registry["whiten_background"]
    result = fixer(
        img,
        mime,
        {"method": "white_threshold", "bg_tolerance": 30},
    )

    assert _check(result.bytes_out, result.mime_out, rule)
    assert result.metadata["pixels_snapped_to_white"] > 0


def test_whiten_background_ai_mode_returns_unimplemented_hint():
    img, mime = _jpeg(500, 500)
    fixer = fixer_registry["whiten_background"]
    result = fixer(img, mime, {"method": "ai_remove_bg"})

    assert result.metadata["applied"] is False
    assert "REPLICATE_API_TOKEN" in result.metadata["hint"]


# ─── crop_to_fill_ratio ─────────────────────────────────────────────


def test_crop_fixes_product_fill_ratio():
    """A 2000x2000 image with a tiny 400x400 grey product centred → 20% fill.
    Fixer should crop down so the product fills ≥ 85%.
    """
    img = Image.new("RGB", (2000, 2000), (255, 255, 255))
    d = ImageDraw.Draw(img)
    # product 400x400 centred
    d.rectangle([800, 800, 1200, 1200], fill=(100, 100, 100))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    small_product = buf.getvalue()

    rule = _rule("amazon.main_image.product_fill_ratio")
    assert not _check(small_product, "image/jpeg", rule)

    fixer = fixer_registry["crop_to_fill_ratio"]
    result = fixer(
        small_product,
        "image/jpeg",
        {"target_ratio": 0.87, "preserve_subject": True, "bg_tolerance": 5},
    )

    assert _check(result.bytes_out, result.mime_out, rule), result.metadata


# ─── smooth_halo_edges ──────────────────────────────────────────────


def test_smooth_halo_edges_only_applies_to_rgba():
    """RGB input should be a no-op with explicit reason."""
    img = Image.new("RGB", (500, 500), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)

    fixer = fixer_registry["smooth_halo_edges"]
    result = fixer(buf.getvalue(), "image/jpeg", {"alpha_feather_px": 2})

    assert result.metadata["applied"] is False
    assert "RGBA" in result.metadata["reason"]


def test_smooth_halo_edges_softens_rgba_alpha():
    rgba = Image.new("RGBA", (500, 500), (0, 0, 0, 0))
    d = ImageDraw.Draw(rgba)
    d.rectangle([100, 100, 400, 400], fill=(120, 120, 120, 255))
    buf = io.BytesIO()
    rgba.save(buf, format="PNG")

    fixer = fixer_registry["smooth_halo_edges"]
    result = fixer(buf.getvalue(), "image/png", {"alpha_feather_px": 3})

    assert result.mime_out == "image/png"
    # The fixer should at least leave us with a parseable RGBA PNG
    out_img = Image.open(io.BytesIO(result.bytes_out))
    assert out_img.mode == "RGBA"
