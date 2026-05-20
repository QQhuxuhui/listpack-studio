"""D16 APlusBuilderExecutor tests — module renderers + compliance check."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from generators import (
    APlusBuilderExecutor,
    APlusModuleType,
    ComparisonModule,
    ComparisonRow,
    FeatureGridItem,
    FeatureGridModule,
    HeroModule,
    StandardImageTextModule,
    TextAreaTooLarge,
)


@pytest.fixture
def builder() -> APlusBuilderExecutor:
    return APlusBuilderExecutor()


def _jpeg(width: int = 800, height: int = 800, color=(120, 120, 120)) -> bytes:
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ─── HERO ─────────────────────────────────────────────────────────


def test_hero_renders_at_970x600(builder):
    mod = HeroModule(
        background_image_bytes=_jpeg(1200, 800, (60, 80, 110)),
        title="Premium Linen Dress",
        subtitle="Soft, breathable, ethical.",
        text_position="overlay-left",
    )
    out = builder.render_hero(mod)

    assert out.module_type is APlusModuleType.hero
    assert out.width == 970 and out.height == 600
    img = Image.open(io.BytesIO(out.image_bytes))
    assert img.size == (970, 600)
    assert out.mime == "image/jpeg"
    assert out.text_area_pct <= 0.30


def test_hero_text_below_overlay(builder):
    mod = HeroModule(
        background_image_bytes=_jpeg(),
        title="Spring Sale",
        text_position="below",
    )
    out = builder.render_hero(mod)
    assert out.width == 970 and out.height == 600


# ─── STANDARD IMAGE + TEXT ────────────────────────────────────────


def test_standard_image_text_renders(builder):
    mod = StandardImageTextModule(
        image_bytes=_jpeg(),
        title="100% Linen",
        body="OEKO-TEX certified, woven in Portugal, designed for breathability "
        "and quick drying after wash.",
    )
    out = builder.render_standard_image_text(mod)

    assert out.module_type is APlusModuleType.standard_image_text
    assert out.width == 970 and out.height == 600
    assert out.text_area_pct <= 0.30


def test_standard_image_text_mirrored_layout(builder):
    """text_side='left' should still produce a valid render."""
    mod = StandardImageTextModule(
        image_bytes=_jpeg(),
        title="Easy Care",
        body="Machine washable, no special handling needed.",
        text_side="left",
    )
    out = builder.render_standard_image_text(mod)
    assert out.width == 970 and out.height == 600


# ─── FEATURE GRID ─────────────────────────────────────────────────


def test_feature_grid_with_4_items(builder):
    items = [
        FeatureGridItem(image_bytes=_jpeg(), title="Soft", description="100% linen feel"),
        FeatureGridItem(image_bytes=_jpeg(), title="Breathable", description="airflow rich"),
        FeatureGridItem(image_bytes=_jpeg(), title="Durable", description="long lasting"),
        FeatureGridItem(image_bytes=_jpeg(), title="Ethical", description="fair trade made"),
    ]
    mod = FeatureGridModule(items=items)
    out = builder.render_feature_grid(mod)

    assert out.module_type is APlusModuleType.feature_grid
    assert out.width == 970 and out.height == 600
    assert out.text_area_pct <= 0.30


def test_feature_grid_with_2_items_centred(builder):
    items = [
        FeatureGridItem(image_bytes=_jpeg(), title="One", description="just one"),
        FeatureGridItem(image_bytes=_jpeg(), title="Two", description="and two"),
    ]
    mod = FeatureGridModule(items=items)
    out = builder.render_feature_grid(mod)
    assert out.width == 970 and out.height == 600


# ─── COMPARISON ───────────────────────────────────────────────────


def test_comparison_renders(builder):
    mod = ComparisonModule(
        column_headers=["Linen Pro", "Linen Basic", "Cotton"],
        rows=[
            ComparisonRow(label="Material", cells=["100% Linen", "70% Linen", "Cotton"]),
            ComparisonRow(label="Weight", cells=["180g", "150g", "220g"]),
            ComparisonRow(label="Wash", cells=["Machine OK", "Machine OK", "Cold only"]),
        ],
    )
    out = builder.render_comparison(mod)

    assert out.module_type is APlusModuleType.comparison
    assert out.width == 970 and out.height == 600


# ─── compliance: text area cap ────────────────────────────────────


def test_text_area_limit_actually_enforced(builder, monkeypatch):
    """The text-area cap really trips — verified by tightening it to ~0%."""
    monkeypatch.setattr(builder, "MAX_TEXT_AREA_PCT", 0.001)
    mod = HeroModule(
        background_image_bytes=_jpeg(),
        title="This title alone exceeds 0.1% of the canvas area",
    )
    with pytest.raises(TextAreaTooLarge):
        builder.render_hero(mod)


def test_normal_text_passes_30pct_default(builder):
    """Realistic captions land well under the 30% Amazon cap."""
    mod = StandardImageTextModule(
        image_bytes=_jpeg(),
        title="100% Linen",
        body="OEKO-TEX certified, woven in Portugal, machine washable.",
    )
    out = builder.render_standard_image_text(mod)
    assert out.text_area_pct < 0.30


# ─── compliance: file size budget ────────────────────────────────


def test_output_under_2mb_budget(builder):
    """A+ Content modules must be ≤ 2 MB (PRD § 03 § 1.4). Our default
    JPEG q=88 at 970×600 always lands under that."""
    mod = HeroModule(
        background_image_bytes=_jpeg(2000, 1500),
        title="Test",
    )
    out = builder.render_hero(mod)
    assert len(out.image_bytes) <= 2 * 1024 * 1024


# ─── compliance: RGB output ──────────────────────────────────────


def test_output_is_rgb_not_cmyk(builder):
    """Amazon A+ Content fails CMYK uploads (PRD § 03 § 1.4)."""
    mod = HeroModule(background_image_bytes=_jpeg(), title="x")
    out = builder.render_hero(mod)
    img = Image.open(io.BytesIO(out.image_bytes))
    assert img.mode == "RGB"
