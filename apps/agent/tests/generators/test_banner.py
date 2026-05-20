"""D17 BannerExecutor tests."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from generators import (
    BackgroundImageLayer,
    BannerExecutor,
    CalloutLayer,
    Canvas,
    CompositionSpec,
    FontSpec,
    Position,
    ProductLayer,
    Size,
    TextLayer,
    VectorShapeLayer,
)


@pytest.fixture
def banner() -> BannerExecutor:
    return BannerExecutor()


def _png(width: int = 200, height: int = 200, color=(120, 120, 120, 255)) -> bytes:
    img = Image.new("RGBA", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg(width: int = 1200, height: int = 800, color=(40, 60, 90)) -> bytes:
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ─── single-layer canvases ────────────────────────────────────────


def test_renders_blank_canvas(banner):
    spec = CompositionSpec(
        canvas=Canvas(width=400, height=200, background_color="#FF6B6B"),
        layers=[],
    )
    out = banner.render(spec)
    img = Image.open(io.BytesIO(out.png_bytes))
    assert img.size == (400, 200)
    # Centre pixel should be the background colour
    assert img.getpixel((200, 100))[:3] == (255, 107, 107)


def test_background_image_layer_covers_canvas(banner):
    spec = CompositionSpec(
        canvas=Canvas(width=600, height=300),
        layers=[
            BackgroundImageLayer(id="bg", image_bytes=_jpeg(1200, 600, (10, 20, 30))),
        ],
    )
    out = banner.render(spec)
    img = Image.open(io.BytesIO(out.png_bytes)).convert("RGB")
    px = img.getpixel((300, 150))
    # The dark fill colour should dominate
    assert max(px) <= 50


# ─── product + shadow ─────────────────────────────────────────────


def test_product_layer_pastes_at_correct_position(banner):
    """Big bright product pasted at (100, 100), 200×200, should be visible."""
    spec = CompositionSpec(
        canvas=Canvas(width=600, height=400, background_color="#FFFFFF"),
        layers=[
            ProductLayer(
                id="p1",
                image_bytes=_png(200, 200, (255, 80, 80, 255)),
                position=Position(x=100, y=100),
                size=Size(width=200, height=200),
            ),
        ],
    )
    out = banner.render(spec)
    img = Image.open(io.BytesIO(out.png_bytes))
    inside = img.getpixel((200, 200))[:3]
    outside = img.getpixel((50, 50))[:3]
    assert inside == (255, 80, 80)
    assert outside == (255, 255, 255)


def test_product_with_shadow_keeps_product_visible(banner):
    spec = CompositionSpec(
        canvas=Canvas(width=400, height=400),
        layers=[
            ProductLayer(
                id="p",
                image_bytes=_png(150, 150, (200, 200, 200, 255)),
                position=Position(x=125, y=125),
                size=Size(width=150, height=150),
                shadow=True,
            ),
        ],
    )
    out = banner.render(spec)
    img = Image.open(io.BytesIO(out.png_bytes))
    centre = img.getpixel((200, 200))[:3]
    assert max(centre) >= 150  # product still readable through any shadow


# ─── text + pill background ────────────────────────────────────────


def test_text_layer_writes_to_canvas(banner):
    spec = CompositionSpec(
        canvas=Canvas(width=400, height=120, background_color="#FFFFFF"),
        layers=[
            TextLayer(
                id="t",
                content="Hello",
                position=Position(x=20, y=20),
                color="#000000",
                font=FontSpec(size_px=40, weight="bold"),
            ),
        ],
    )
    out = banner.render(spec)
    img = Image.open(io.BytesIO(out.png_bytes)).convert("RGB")
    # Should have *some* near-black pixels in the text region
    pixels_seen = 0
    dark = 0
    for y in range(20, 70):
        for x in range(20, 200):
            pixels_seen += 1
            if sum(img.getpixel((x, y))) < 200:
                dark += 1
    assert pixels_seen > 0
    assert dark > 10, "no dark text pixels found"


def test_text_with_pill_background(banner):
    spec = CompositionSpec(
        canvas=Canvas(width=400, height=120),
        layers=[
            TextLayer(
                id="t",
                content="SALE",
                position=Position(x=50, y=40),
                color="#FFFFFF",
                background_color="#FF6B6B",
                padding=12,
                font=FontSpec(size_px=32, weight="extra-bold"),
            ),
        ],
    )
    out = banner.render(spec)
    img = Image.open(io.BytesIO(out.png_bytes)).convert("RGB")
    # Sample in the pill's left padding margin (x=42) — clear of the white
    # SALE glyphs (which begin around x=50) but inside the pill (which starts
    # at text_bbox.left - padding ≈ 38).
    pill_left_pad = img.getpixel((42, 60))
    assert pill_left_pad[0] > 200 and pill_left_pad[1] < 150, pill_left_pad


# ─── shapes ───────────────────────────────────────────────────────


def test_circle_shape_renders(banner):
    spec = CompositionSpec(
        canvas=Canvas(width=200, height=200, background_color="#FFFFFF"),
        layers=[
            VectorShapeLayer(
                id="c",
                shape="circle",
                position=Position(x=50, y=50),
                size=Size(width=100, height=100),
                fill="#00CC88",
            ),
        ],
    )
    out = banner.render(spec)
    img = Image.open(io.BytesIO(out.png_bytes)).convert("RGB")
    # Inside the circle's bbox centre should be the fill colour
    assert img.getpixel((100, 100)) == (0, 204, 136)
    # Outside should be white
    assert img.getpixel((10, 10)) == (255, 255, 255)


# ─── callout anchors to another layer ─────────────────────────────


def test_callout_resolves_anchor(banner):
    spec = CompositionSpec(
        canvas=Canvas(width=600, height=400),
        layers=[
            ProductLayer(
                id="p1",
                image_bytes=_png(200, 200),
                position=Position(x=100, y=100),
                size=Size(width=200, height=200),
            ),
            CalloutLayer(
                id="cb",
                anchor_to="p1",
                anchor_point="top-right",
                text="100% Linen",
            ),
        ],
    )
    out = banner.render(spec)
    # Callout draws a tether line from (300, 100) outward — sample slightly to
    # the right of the product's top-right corner to confirm something painted
    img = Image.open(io.BytesIO(out.png_bytes)).convert("RGB")
    sample = img.getpixel((312, 100))
    assert sum(sample) < 255 * 3  # not pure white


def test_callout_with_missing_anchor_is_skipped(banner):
    spec = CompositionSpec(
        canvas=Canvas(width=200, height=100),
        layers=[
            CalloutLayer(
                id="cb",
                anchor_to="does_not_exist",
                anchor_point="top-right",
                text="orphan",
            ),
        ],
    )
    out = banner.render(spec)
    assert out.layer_count == 1  # spec layer count, not paint count


# ─── z-index ──────────────────────────────────────────────────────


def test_z_index_paint_order(banner):
    """Higher z_index paints later (on top)."""
    spec = CompositionSpec(
        canvas=Canvas(width=200, height=200),
        layers=[
            VectorShapeLayer(
                id="bottom",
                shape="rectangle",
                position=Position(x=0, y=0),
                size=Size(width=200, height=200),
                fill="#0000FF",  # blue
                z_index=0,
            ),
            VectorShapeLayer(
                id="top",
                shape="rectangle",
                position=Position(x=50, y=50),
                size=Size(width=100, height=100),
                fill="#FF0000",  # red
                z_index=1,
            ),
        ],
    )
    out = banner.render(spec)
    img = Image.open(io.BytesIO(out.png_bytes)).convert("RGB")
    assert img.getpixel((100, 100)) == (255, 0, 0)  # red on top
    assert img.getpixel((10, 10)) == (0, 0, 255)   # blue exposed at corner


# ─── SVG export ──────────────────────────────────────────────────


def test_svg_export_includes_text_and_shape(banner):
    spec = CompositionSpec(
        canvas=Canvas(width=400, height=200, background_color="#FFFFFF"),
        layers=[
            VectorShapeLayer(
                id="bg",
                shape="rectangle",
                position=Position(x=0, y=0),
                size=Size(width=400, height=200),
                fill="#EEEEEE",
            ),
            TextLayer(
                id="t",
                content="Hello & <world>",
                position=Position(x=20, y=20),
                color="#222222",
                font=FontSpec(size_px=32, weight="bold"),
            ),
        ],
        export_formats=["png", "svg"],
    )
    out = banner.render(spec)
    assert out.svg_text is not None
    svg = out.svg_text
    assert "<svg" in svg and 'width="400"' in svg
    assert "<rect" in svg
    assert "<text" in svg
    # XML escaping must protect < and >
    assert "Hello &amp; &lt;world&gt;" in svg


def test_svg_not_emitted_unless_requested(banner):
    spec = CompositionSpec(
        canvas=Canvas(width=200, height=200),
        layers=[],
        export_formats=["png"],
    )
    out = banner.render(spec)
    assert out.svg_text is None
