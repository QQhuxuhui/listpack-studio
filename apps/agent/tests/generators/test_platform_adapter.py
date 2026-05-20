"""D18 PlatformAdapter tests."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from generators import (
    AdaptedImage,
    PlatformAdapter,
    PlatformSlot,
    SLOT_CATALOG,
)


@pytest.fixture
def adapter() -> PlatformAdapter:
    return PlatformAdapter()


def _jpeg(width: int, height: int, color=(120, 120, 120), quality: int = 90) -> bytes:
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


# ─── single slot ─────────────────────────────────────────────────


def test_amazon_main_targets_2000_pad(adapter):
    src = _jpeg(1000, 1000)
    out = adapter.adapt(src, [PlatformSlot.amazon_main])
    assert len(out) == 1
    assert isinstance(out[0], AdaptedImage)
    assert out[0].width == 2000 and out[0].height == 2000
    assert out[0].fit_mode == "pad"
    img = Image.open(io.BytesIO(out[0].bytes_data))
    assert img.size == (2000, 2000)


def test_temu_main_targets_1600(adapter):
    src = _jpeg(800, 800)
    out = adapter.adapt(src, [PlatformSlot.temu_main])
    assert out[0].width == 1600 and out[0].height == 1600


def test_shein_catalog_is_portrait(adapter):
    src = _jpeg(1000, 1000)
    out = adapter.adapt(src, [PlatformSlot.shein_catalog])
    assert out[0].width == 900 and out[0].height == 1200


# ─── multi-slot batch ────────────────────────────────────────────


def test_batch_returns_one_per_slot(adapter):
    src = _jpeg(2000, 1500)
    slots = [
        PlatformSlot.amazon_main,
        PlatformSlot.amazon_secondary,
        PlatformSlot.temu_main,
        PlatformSlot.shein_catalog,
    ]
    out = adapter.adapt(src, slots)
    assert len(out) == len(slots)
    assert {o.slot for o in out} == set(slots)


def test_adapt_all_platforms_filters_by_prefix(adapter):
    src = _jpeg(1500, 1500)
    out = adapter.adapt_all_platforms(src, ["amazon"])
    slots = {o.slot for o in out}
    # Should only contain amazon.* slots
    assert all(s.value.startswith("amazon.") for s in slots)
    assert PlatformSlot.amazon_main in slots
    assert PlatformSlot.shopify_hero not in slots


# ─── pad vs cover ────────────────────────────────────────────────


def test_pad_preserves_aspect_with_white_borders(adapter):
    """A square source padded into a portrait slot should have white top/bottom."""
    src = _jpeg(1000, 1000, color=(0, 0, 0))  # pure black square
    out = adapter.adapt(src, [PlatformSlot.shein_catalog])
    img = Image.open(io.BytesIO(out[0].bytes_data))
    # SHEIN catalog is 900×1200 portrait; the source resizes to 900×900
    # and gets centred → top + bottom rows should be white pad
    top_pixel = img.getpixel((450, 5))
    bottom_pixel = img.getpixel((450, 1195))
    assert top_pixel == (255, 255, 255), top_pixel
    assert bottom_pixel == (255, 255, 255), bottom_pixel


def test_cover_for_a_plus_hero_crops(adapter):
    """A+ hero slot uses cover mode — square source → cropped to 970×600."""
    src = _jpeg(1000, 1000, color=(0, 0, 0))
    out = adapter.adapt(src, [PlatformSlot.amazon_a_plus_hero])
    img = Image.open(io.BytesIO(out[0].bytes_data))
    assert img.size == (970, 600)
    # All pixels should be black (no padding when covering)
    assert img.getpixel((485, 300)) == (0, 0, 0)


# ─── RGBA → JPEG conversion ─────────────────────────────────────


def test_rgba_source_flattens_to_jpeg(adapter):
    rgba = Image.new("RGBA", (500, 500), (0, 0, 0, 0))  # fully transparent
    from PIL import ImageDraw

    d = ImageDraw.Draw(rgba)
    d.rectangle([100, 100, 400, 400], fill=(80, 80, 80, 255))
    buf = io.BytesIO()
    rgba.save(buf, format="PNG")

    out = adapter.adapt(buf.getvalue(), [PlatformSlot.amazon_main])
    img = Image.open(io.BytesIO(out[0].bytes_data))
    # Output is JPEG (no alpha) — transparent areas are white now
    assert img.mode == "RGB"
    assert img.getpixel((10, 10)) == (255, 255, 255)


def test_unknown_slot_raises(adapter):
    """Custom catalogs must declare every slot they're asked to render."""

    class _FakeSlot:
        value = "fictional.slot"

    src = _jpeg(500, 500)
    with pytest.raises(ValueError):
        adapter.adapt(src, [_FakeSlot()])  # type: ignore[list-item]


# ─── catalog completeness ───────────────────────────────────────


def test_catalog_covers_all_target_platforms():
    """Every platform in PRD § 03 must have at least one slot recipe."""
    prefixes = {s.value.split(".", 1)[0] for s in SLOT_CATALOG}
    assert {"amazon", "shopify", "temu", "shein", "ebay"} <= prefixes
