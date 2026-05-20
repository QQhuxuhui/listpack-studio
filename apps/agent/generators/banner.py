"""BannerExecutor — render layered banners (BannerAgency-inspired).

PRD § 02 § 5 (Sony's BannerAgency, EMNLP 2025): a banner is a layered
composition (background + product + text + decoration). Each layer is
edited independently so designers can iterate without re-running the model
for the whole banner.

ListPack splits this into:
  composition_spec  →  Layer[]  →  Pillow canvas  →  PNG / SVG export

PSD layered output (planned in PRD) is deferred to v2; psd-tools writes
PSDs but its inverse-blend code paths are fiddly enough to deserve their
own iteration.

Supported layer types:
- BACKGROUND_IMAGE  paste an image filling the canvas
- PRODUCT           paste an image at (x, y) with explicit size
- TEXT              draw text with font + colour (code-rendered for fidelity)
- VECTOR_SHAPE      circle / rectangle / ellipse with fill + opacity
- CALLOUT           short label tethered to another layer's anchor

Each layer carries `z_index` for stacking order; renderer sorts before paint.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Literal
from xml.sax.saxutils import escape as xml_escape

from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, ConfigDict, Field

from .a_plus import APlusBuilderExecutor  # reuse font discovery helpers

logger = logging.getLogger("listpack.generators.banner")


# ─── data models ───────────────────────────────────────────────────


class LayerType(str, Enum):
    background_image = "background_image"
    product = "product"
    text = "text"
    vector_shape = "vector_shape"
    callout = "callout"


class Position(BaseModel):
    """Pixel coords on the canvas. (0, 0) = top-left."""

    x: int
    y: int


class Size(BaseModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class Canvas(BaseModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    background_color: str = "#FFFFFF"  # hex


class LayerBase(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    id: str
    z_index: int = 0
    opacity: float = Field(default=1.0, ge=0.0, le=1.0)


class BackgroundImageLayer(LayerBase):
    type: Literal[LayerType.background_image] = LayerType.background_image
    image_bytes: bytes
    image_mime: str = "image/jpeg"


class ProductLayer(LayerBase):
    type: Literal[LayerType.product] = LayerType.product
    image_bytes: bytes
    image_mime: str = "image/png"  # commonly RGBA cutout
    position: Position
    size: Size
    shadow: bool = False


class FontSpec(BaseModel):
    family: str = "Inter"
    size_px: int = 24
    weight: Literal["regular", "bold", "extra-bold"] = "regular"


class TextLayer(LayerBase):
    type: Literal[LayerType.text] = LayerType.text
    content: str = Field(min_length=1, max_length=500)
    position: Position
    color: str = "#111111"
    font: FontSpec = Field(default_factory=FontSpec)
    text_align: Literal["left", "center", "right"] = "left"
    background_color: str | None = None  # optional pill behind text
    padding: int = 0


class VectorShapeLayer(LayerBase):
    type: Literal[LayerType.vector_shape] = LayerType.vector_shape
    shape: Literal["rectangle", "circle", "ellipse"]
    position: Position  # top-left
    size: Size
    fill: str = "#000000"
    stroke: str | None = None
    stroke_width: int = 0


class CalloutLayer(LayerBase):
    """Short label tethered to another layer's anchor.

    Renderer resolves `anchor_to` → that layer's bbox → computes the
    callout's actual (x, y) from `anchor_point`. Keep tether simple: a
    horizontal line and the text box.
    """

    type: Literal[LayerType.callout] = LayerType.callout
    anchor_to: str  # id of a sibling layer
    anchor_point: Literal[
        "top-left", "top-right", "bottom-left", "bottom-right",
        "left-center", "right-center",
    ] = "top-right"
    text: str
    color: str = "#111111"
    font: FontSpec = Field(default_factory=lambda: FontSpec(size_px=16))


Layer = (
    BackgroundImageLayer
    | ProductLayer
    | TextLayer
    | VectorShapeLayer
    | CalloutLayer
)


class CompositionSpec(BaseModel):
    """Top-level banner schema. Render with `BannerExecutor.render(spec)`."""

    canvas: Canvas
    layers: list[Layer]
    export_formats: list[Literal["png", "svg"]] = Field(default_factory=lambda: ["png"])


# ─── render result ────────────────────────────────────────────────


@dataclass
class RenderedBanner:
    png_bytes: bytes
    png_mime: str = "image/png"
    svg_text: str | None = None
    canvas_size: tuple[int, int] = (0, 0)
    layer_count: int = 0


# ─── executor ─────────────────────────────────────────────────────


class BannerExecutor:
    """Render a CompositionSpec to PNG + optional SVG.

    Stateless apart from font discovery. Shared font helper with A+ builder.
    """

    def __init__(self, *, font_path: str | None = None) -> None:
        self._font_path = font_path or APlusBuilderExecutor._discover_font()

    def render(self, spec: CompositionSpec) -> RenderedBanner:
        # bbox cache: layer.id → (x0,y0,x1,y1) after paint, so callouts can anchor
        bbox: dict[str, tuple[int, int, int, int]] = {}

        # Start from canvas background colour
        bg = self._hex_to_rgb(spec.canvas.background_color)
        canvas = Image.new("RGBA", (spec.canvas.width, spec.canvas.height), (*bg, 255))

        for layer in sorted(spec.layers, key=lambda l: l.z_index):
            try:
                if isinstance(layer, BackgroundImageLayer):
                    self._paint_background_image(canvas, layer, bbox)
                elif isinstance(layer, ProductLayer):
                    self._paint_product(canvas, layer, bbox)
                elif isinstance(layer, TextLayer):
                    self._paint_text(canvas, layer, bbox)
                elif isinstance(layer, VectorShapeLayer):
                    self._paint_shape(canvas, layer, bbox)
                elif isinstance(layer, CalloutLayer):
                    self._paint_callout(canvas, layer, bbox)
            except Exception as exc:  # pragma: no cover defensive
                logger.exception("layer %r failed to render: %s", layer.id, exc)
                raise

        # PNG output
        rgb_canvas = self._flatten_alpha(canvas)
        png_buf = io.BytesIO()
        rgb_canvas.save(png_buf, format="PNG", optimize=True)

        svg = self._svg_for(spec, bbox) if "svg" in spec.export_formats else None

        return RenderedBanner(
            png_bytes=png_buf.getvalue(),
            svg_text=svg,
            canvas_size=(spec.canvas.width, spec.canvas.height),
            layer_count=len(spec.layers),
        )

    # ── paint helpers ─────────────────────────────────────────────

    def _paint_background_image(
        self,
        canvas: Image.Image,
        layer: BackgroundImageLayer,
        bbox: dict,
    ) -> None:
        with Image.open(io.BytesIO(layer.image_bytes)) as src:
            src = src.convert("RGBA")
            bg = APlusBuilderExecutor._cover_resize(src, canvas.size)
            self._composite_with_opacity(canvas, bg, (0, 0), layer.opacity)
        bbox[layer.id] = (0, 0, canvas.width, canvas.height)

    def _paint_product(
        self,
        canvas: Image.Image,
        layer: ProductLayer,
        bbox: dict,
    ) -> None:
        with Image.open(io.BytesIO(layer.image_bytes)) as src:
            src = src.convert("RGBA")
            resized = src.resize(
                (layer.size.width, layer.size.height),
                Image.Resampling.LANCZOS,
            )
            if layer.shadow:
                shadow = self._drop_shadow(resized, blur_px=20, offset_y=12)
                self._composite_with_opacity(
                    canvas, shadow, (layer.position.x, layer.position.y), layer.opacity
                )
            self._composite_with_opacity(
                canvas, resized, (layer.position.x, layer.position.y), layer.opacity
            )
        bbox[layer.id] = (
            layer.position.x,
            layer.position.y,
            layer.position.x + layer.size.width,
            layer.position.y + layer.size.height,
        )

    def _paint_text(
        self,
        canvas: Image.Image,
        layer: TextLayer,
        bbox: dict,
    ) -> None:
        draw = ImageDraw.Draw(canvas, "RGBA")
        font = self._font(layer.font.size_px)
        color = self._hex_to_rgba(layer.color, layer.opacity)
        text_bbox = draw.textbbox(
            (layer.position.x, layer.position.y), layer.content, font=font
        )
        # Optional pill background
        if layer.background_color:
            pad = max(0, layer.padding)
            bg_rgba = self._hex_to_rgba(layer.background_color, layer.opacity)
            pill_box = (
                text_bbox[0] - pad,
                text_bbox[1] - pad,
                text_bbox[2] + pad,
                text_bbox[3] + pad,
            )
            draw.rounded_rectangle(pill_box, radius=max(8, layer.font.size_px // 3), fill=bg_rgba)

        draw.text((layer.position.x, layer.position.y), layer.content, font=font, fill=color)
        bbox[layer.id] = text_bbox

    def _paint_shape(
        self,
        canvas: Image.Image,
        layer: VectorShapeLayer,
        bbox: dict,
    ) -> None:
        draw = ImageDraw.Draw(canvas, "RGBA")
        fill = self._hex_to_rgba(layer.fill, layer.opacity)
        stroke = (
            self._hex_to_rgba(layer.stroke, layer.opacity)
            if layer.stroke
            else None
        )
        x0, y0 = layer.position.x, layer.position.y
        x1 = x0 + layer.size.width
        y1 = y0 + layer.size.height
        coords = (x0, y0, x1, y1)
        if layer.shape == "rectangle":
            draw.rectangle(coords, fill=fill, outline=stroke, width=layer.stroke_width)
        elif layer.shape in ("circle", "ellipse"):
            draw.ellipse(coords, fill=fill, outline=stroke, width=layer.stroke_width)
        bbox[layer.id] = coords

    def _paint_callout(
        self,
        canvas: Image.Image,
        layer: CalloutLayer,
        bbox: dict,
    ) -> None:
        target_bbox = bbox.get(layer.anchor_to)
        if target_bbox is None:
            logger.warning(
                "callout %r anchors to unknown layer %r; skipping",
                layer.id, layer.anchor_to,
            )
            return
        anchor_x, anchor_y = self._anchor_xy(target_bbox, layer.anchor_point)

        draw = ImageDraw.Draw(canvas, "RGBA")
        font = self._font(layer.font.size_px)
        color = self._hex_to_rgba(layer.color, layer.opacity)

        # Short horizontal tether line + label
        line_len = 30
        end_x = (
            anchor_x + line_len
            if "right" in layer.anchor_point or "center" in layer.anchor_point
            else anchor_x - line_len
        )
        draw.line(
            (anchor_x, anchor_y, end_x, anchor_y),
            fill=color,
            width=2,
        )
        text_x = end_x + 8 if end_x >= anchor_x else end_x - 8
        text_anchor = "lm" if end_x >= anchor_x else "rm"
        draw.text((text_x, anchor_y), layer.text, font=font, fill=color, anchor=text_anchor)
        # rough bbox for chain anchoring
        bbox[layer.id] = (min(anchor_x, end_x), anchor_y - 10, max(anchor_x, end_x) + 100, anchor_y + 10)

    # ── helpers ───────────────────────────────────────────────────

    def _font(self, size: int) -> ImageFont.ImageFont:
        if self._font_path:
            return ImageFont.truetype(self._font_path, size)
        return ImageFont.load_default(size=size)

    @staticmethod
    def _hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
        s = hex_str.lstrip("#")
        if len(s) == 3:
            s = "".join(c * 2 for c in s)
        return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)

    def _hex_to_rgba(self, hex_str: str, opacity: float) -> tuple[int, int, int, int]:
        r, g, b = self._hex_to_rgb(hex_str)
        return r, g, b, int(round(255 * opacity))

    @staticmethod
    def _anchor_xy(box: tuple[int, int, int, int], point: str) -> tuple[int, int]:
        x0, y0, x1, y1 = box
        mx, my = (x0 + x1) // 2, (y0 + y1) // 2
        return {
            "top-left": (x0, y0),
            "top-right": (x1, y0),
            "bottom-left": (x0, y1),
            "bottom-right": (x1, y1),
            "left-center": (x0, my),
            "right-center": (x1, my),
        }[point]

    @staticmethod
    def _composite_with_opacity(
        canvas: Image.Image,
        overlay: Image.Image,
        offset: tuple[int, int],
        opacity: float,
    ) -> None:
        if opacity >= 0.999:
            canvas.alpha_composite(overlay, dest=offset)
            return
        # Scale alpha channel by opacity then composite
        if overlay.mode != "RGBA":
            overlay = overlay.convert("RGBA")
        r, g, b, a = overlay.split()
        a = a.point(lambda v: int(v * opacity))
        scaled = Image.merge("RGBA", (r, g, b, a))
        canvas.alpha_composite(scaled, dest=offset)

    @staticmethod
    def _drop_shadow(rgba: Image.Image, *, blur_px: int, offset_y: int) -> Image.Image:
        from PIL import ImageFilter

        shadow = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
        # Use alpha as the silhouette
        a = rgba.split()[-1]
        shadow.putalpha(a.point(lambda v: int(v * 0.5)))
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius=blur_px))
        # Offset by translating with paste — caller paints first then product on top
        offset_canvas = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
        offset_canvas.paste(shadow, (0, offset_y), shadow)
        return offset_canvas

    @staticmethod
    def _flatten_alpha(rgba: Image.Image) -> Image.Image:
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg

    # ── SVG export (text + shapes only; raster layers → <image> with base64) ──

    def _svg_for(self, spec: CompositionSpec, bbox: dict) -> str:
        """Emit an SVG representation. Raster layers are encoded as base64-PNG."""
        import base64

        parts: list[str] = [
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'width="{spec.canvas.width}" height="{spec.canvas.height}" '
            f'viewBox="0 0 {spec.canvas.width} {spec.canvas.height}">',
            f'<rect width="100%" height="100%" fill="{spec.canvas.background_color}"/>',
        ]

        for layer in sorted(spec.layers, key=lambda l: l.z_index):
            if isinstance(layer, (BackgroundImageLayer, ProductLayer)):
                b64 = base64.b64encode(layer.image_bytes).decode("ascii")
                if isinstance(layer, ProductLayer):
                    parts.append(
                        f'<image href="data:image/png;base64,{b64}" '
                        f'x="{layer.position.x}" y="{layer.position.y}" '
                        f'width="{layer.size.width}" height="{layer.size.height}" '
                        f'opacity="{layer.opacity}"/>'
                    )
                else:
                    parts.append(
                        f'<image href="data:{layer.image_mime};base64,{b64}" '
                        f'x="0" y="0" width="{spec.canvas.width}" '
                        f'height="{spec.canvas.height}" '
                        f'preserveAspectRatio="xMidYMid slice" '
                        f'opacity="{layer.opacity}"/>'
                    )
            elif isinstance(layer, TextLayer):
                size = layer.font.size_px
                weight = {"regular": "400", "bold": "700", "extra-bold": "800"}[
                    layer.font.weight
                ]
                # SVG <text> anchors at baseline by default — add `dy` so y treats
                # as top-left like Pillow does
                parts.append(
                    f'<text x="{layer.position.x}" y="{layer.position.y}" '
                    f'dy="{int(size * 0.85)}" '
                    f'font-family="{xml_escape(layer.font.family)}" '
                    f'font-size="{size}" font-weight="{weight}" '
                    f'fill="{layer.color}" opacity="{layer.opacity}">'
                    f'{xml_escape(layer.content)}</text>'
                )
            elif isinstance(layer, VectorShapeLayer):
                x, y = layer.position.x, layer.position.y
                w, h = layer.size.width, layer.size.height
                stroke = layer.stroke or "none"
                if layer.shape == "rectangle":
                    parts.append(
                        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" '
                        f'fill="{layer.fill}" stroke="{stroke}" '
                        f'stroke-width="{layer.stroke_width}" opacity="{layer.opacity}"/>'
                    )
                else:
                    cx, cy = x + w // 2, y + h // 2
                    rx, ry = w // 2, h // 2
                    parts.append(
                        f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" '
                        f'fill="{layer.fill}" stroke="{stroke}" '
                        f'stroke-width="{layer.stroke_width}" opacity="{layer.opacity}"/>'
                    )
            # Callouts: skipped in SVG for v1 — they're a derived layout, not
            # source-of-truth. Designers usually move them after import anyway.

        parts.append("</svg>")
        return "\n".join(parts)
