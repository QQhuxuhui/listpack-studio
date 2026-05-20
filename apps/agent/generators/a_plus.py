"""APlusBuilderExecutor — render Amazon A+ Content modules from data.

Amazon A+ Content (Brand Registry only) is a set of independent module
images uploaded module-by-module to Seller Central. We support the four
highest-leverage module types:

| Type                 | Dimensions   | Purpose                          |
| -------------------- | ------------ | -------------------------------- |
| HERO                 | 970 × 600    | Full-width banner + headline     |
| STANDARD_IMAGE_TEXT  | 300 × 300    | Square image + caption           |
| FEATURE_GRID         | 970 × 600    | 4× (220 × 220) feature panels    |
| COMPARISON           | 970 × 600    | N-column comparison table        |

Per-module compliance constraints from PRD § 03 § 1.4:
- File ≤ 2 MB (we typically emit ~100-300 KB after compression)
- RGB only, no CMYK
- Text occupies ≤ 30% of frame area

The builder NEVER asks a diffusion model to render the caption text —
that goes through Pillow so every glyph is exact, and `_text_area_pct`
runs to assert the ≤30% rule before returning bytes. If a caller's text
overflows, we surface an explicit error rather than ship a non-compliant
module.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Literal

from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("listpack.generators.a_plus")

# ─── module data models ────────────────────────────────────────────


class APlusModuleType(str, Enum):
    hero = "hero"
    standard_image_text = "standard_image_text"
    feature_grid = "feature_grid"
    comparison = "comparison"


class HeroModule(BaseModel):
    """Full-width 970×600 banner."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    type: Literal[APlusModuleType.hero] = APlusModuleType.hero
    background_image_bytes: bytes
    background_mime: str = "image/jpeg"
    title: str = Field(min_length=1, max_length=120)
    subtitle: str | None = Field(default=None, max_length=200)
    text_color: str = "#FFFFFF"
    # Where the text block lands; overlay modes paint on top of the image
    text_position: Literal[
        "overlay-left", "overlay-right", "overlay-center", "below"
    ] = "overlay-left"
    text_shadow: bool = True


class StandardImageTextModule(BaseModel):
    """300×300 square image with caption text block beside it (in code,
    typically rendered into a 1:1 970×485ish layout — caller crops)."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    type: Literal[APlusModuleType.standard_image_text] = APlusModuleType.standard_image_text
    image_bytes: bytes
    image_mime: str = "image/jpeg"
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(max_length=400)
    text_side: Literal["right", "left"] = "right"


class FeatureGridItem(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    image_bytes: bytes
    image_mime: str = "image/jpeg"
    title: str = Field(min_length=1, max_length=40)
    description: str = Field(max_length=120)


class FeatureGridModule(BaseModel):
    type: Literal[APlusModuleType.feature_grid] = APlusModuleType.feature_grid
    items: list[FeatureGridItem] = Field(min_length=2, max_length=4)


class ComparisonRow(BaseModel):
    label: str = Field(max_length=40)
    cells: list[str]  # one cell per column


class ComparisonModule(BaseModel):
    type: Literal[APlusModuleType.comparison] = APlusModuleType.comparison
    column_headers: list[str] = Field(min_length=2, max_length=5)
    rows: list[ComparisonRow] = Field(min_length=1, max_length=10)


@dataclass
class RenderedModule:
    """Output of any module render."""

    module_type: APlusModuleType
    image_bytes: bytes
    mime: str
    width: int
    height: int
    text_area_pct: float


# ─── compliance ────────────────────────────────────────────────────


class TextAreaTooLarge(Exception):
    """Text occupies > max_text_area_pct of the module → Amazon would reject."""


class APlusBuilderExecutor:
    """Stateless renderer; instance-level config holds defaults."""

    HERO_SIZE = (970, 600)
    STANDARD_SIZE = (970, 600)  # full A+ slot; image goes 1:1 in half
    FEATURE_SIZE = (970, 600)
    COMPARISON_SIZE = (970, 600)
    MAX_TEXT_AREA_PCT = 0.30

    def __init__(self, *, font_path: str | None = None) -> None:
        self._font_path = font_path or self._discover_font()

    @staticmethod
    def _discover_font() -> str | None:
        """Find a usable TTF, falling back to PIL's bitmap default."""
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        ]
        for p in candidates:
            if Path(p).is_file():
                return p
        return None

    def _font(self, size: int) -> ImageFont.ImageFont:
        if self._font_path:
            return ImageFont.truetype(self._font_path, size)
        # PIL default font won't honour `size` precisely but exists everywhere
        return ImageFont.load_default(size=size)

    # ── HERO ───────────────────────────────────────────────────────

    def render_hero(self, mod: HeroModule) -> RenderedModule:
        canvas = Image.new("RGB", self.HERO_SIZE, (255, 255, 255))
        with Image.open(io.BytesIO(mod.background_image_bytes)) as bg:
            bg = bg.convert("RGB")
            bg = self._cover_resize(bg, self.HERO_SIZE)
            canvas.paste(bg, (0, 0))

        draw = ImageDraw.Draw(canvas, "RGBA")
        title_font = self._font(56)
        sub_font = self._font(28)

        text_bboxes: list[tuple[int, int, int, int]] = []

        if mod.text_position == "below":
            # paint a bottom 25% bar in semi-transparent overlay
            bar_h = int(self.HERO_SIZE[1] * 0.25)
            draw.rectangle(
                (0, self.HERO_SIZE[1] - bar_h, self.HERO_SIZE[0], self.HERO_SIZE[1]),
                fill=(0, 0, 0, 160),
            )
            tx, ty = 40, self.HERO_SIZE[1] - bar_h + 30
        else:
            tx, ty = self._overlay_anchor(mod.text_position)

        if mod.text_shadow and mod.text_position != "below":
            draw.text((tx + 2, ty + 2), mod.title, font=title_font, fill=(0, 0, 0, 160))
        draw.text((tx, ty), mod.title, font=title_font, fill=mod.text_color)
        text_bboxes.append(draw.textbbox((tx, ty), mod.title, font=title_font))

        if mod.subtitle:
            sub_y = ty + title_font.size + 12
            draw.text((tx, sub_y), mod.subtitle, font=sub_font, fill=mod.text_color)
            text_bboxes.append(draw.textbbox((tx, sub_y), mod.subtitle, font=sub_font))

        return self._finalise(
            canvas,
            APlusModuleType.hero,
            text_bboxes=text_bboxes,
        )

    def _overlay_anchor(self, position: str) -> tuple[int, int]:
        # Anchor points near top-left of each region — we add padding from there
        pad = 40
        w, h = self.HERO_SIZE
        if position == "overlay-left":
            return pad, h // 3
        if position == "overlay-right":
            return w // 2, h // 3
        if position == "overlay-center":
            return w // 4, h // 3
        return pad, pad

    @staticmethod
    def _cover_resize(img: Image.Image, target: tuple[int, int]) -> Image.Image:
        tw, th = target
        iw, ih = img.size
        ratio = max(tw / iw, th / ih)
        new_size = (int(iw * ratio), int(ih * ratio))
        resized = img.resize(new_size, Image.Resampling.LANCZOS)
        x = (resized.width - tw) // 2
        y = (resized.height - th) // 2
        return resized.crop((x, y, x + tw, y + th))

    # ── STANDARD IMAGE + TEXT ──────────────────────────────────────

    def render_standard_image_text(
        self, mod: StandardImageTextModule
    ) -> RenderedModule:
        canvas = Image.new("RGB", self.STANDARD_SIZE, (255, 255, 255))
        # Left half image, right half text (or mirrored)
        with Image.open(io.BytesIO(mod.image_bytes)) as src:
            src = src.convert("RGB")
            half = self.STANDARD_SIZE[0] // 2
            img_box = (half, self.STANDARD_SIZE[1])
            img = self._cover_resize(src, img_box)

        if mod.text_side == "right":
            canvas.paste(img, (0, 0))
            text_x_origin = self.STANDARD_SIZE[0] // 2 + 40
        else:
            canvas.paste(img, (self.STANDARD_SIZE[0] // 2, 0))
            text_x_origin = 40

        draw = ImageDraw.Draw(canvas)
        title_font = self._font(40)
        body_font = self._font(22)
        text_bboxes = []

        tx, ty = text_x_origin, 80
        draw.text((tx, ty), mod.title, font=title_font, fill="#111111")
        text_bboxes.append(draw.textbbox((tx, ty), mod.title, font=title_font))

        body_y = ty + title_font.size + 18
        body_text = self._wrap_text(mod.body, body_font, width_px=420)
        draw.multiline_text(
            (tx, body_y), body_text, font=body_font, fill="#333333", spacing=8
        )
        text_bboxes.append(
            draw.multiline_textbbox((tx, body_y), body_text, font=body_font, spacing=8)
        )

        return self._finalise(canvas, APlusModuleType.standard_image_text, text_bboxes)

    # ── FEATURE GRID ───────────────────────────────────────────────

    def render_feature_grid(self, mod: FeatureGridModule) -> RenderedModule:
        canvas = Image.new("RGB", self.FEATURE_SIZE, (250, 250, 250))
        draw = ImageDraw.Draw(canvas)
        title_font = self._font(22)
        body_font = self._font(16)
        text_bboxes = []

        n = len(mod.items)
        # Layout: horizontal flex, each tile 220 wide
        tile_w = 220
        gutter = (self.FEATURE_SIZE[0] - n * tile_w) // (n + 1)
        tile_h = 220
        tile_y = 60

        for i, item in enumerate(mod.items):
            x0 = gutter + i * (tile_w + gutter)
            # image
            with Image.open(io.BytesIO(item.image_bytes)) as src:
                src = src.convert("RGB")
                img = self._cover_resize(src, (tile_w, tile_h))
                canvas.paste(img, (x0, tile_y))
            # caption
            cy = tile_y + tile_h + 20
            draw.text((x0, cy), item.title, font=title_font, fill="#111111")
            text_bboxes.append(draw.textbbox((x0, cy), item.title, font=title_font))
            wrapped = self._wrap_text(item.description, body_font, width_px=tile_w - 8)
            dy = cy + title_font.size + 6
            draw.multiline_text(
                (x0, dy), wrapped, font=body_font, fill="#555555", spacing=4
            )
            text_bboxes.append(
                draw.multiline_textbbox((x0, dy), wrapped, font=body_font, spacing=4)
            )

        return self._finalise(canvas, APlusModuleType.feature_grid, text_bboxes)

    # ── COMPARISON ─────────────────────────────────────────────────

    def render_comparison(self, mod: ComparisonModule) -> RenderedModule:
        canvas = Image.new("RGB", self.COMPARISON_SIZE, (255, 255, 255))
        draw = ImageDraw.Draw(canvas)
        header_font = self._font(22)
        cell_font = self._font(18)
        label_font = self._font(20)
        text_bboxes = []

        n_cols = len(mod.column_headers)
        header_row_h = 60
        row_h = (self.COMPARISON_SIZE[1] - header_row_h) // (len(mod.rows) + 1)

        # 1st column is row labels — give it 30%
        label_col_w = int(self.COMPARISON_SIZE[0] * 0.30)
        col_w = (self.COMPARISON_SIZE[0] - label_col_w) // n_cols

        # Header row
        for i, h in enumerate(mod.column_headers):
            x = label_col_w + i * col_w
            draw.rectangle(
                (x, 0, x + col_w, header_row_h), outline="#DDDDDD", width=1
            )
            draw.text((x + 12, 18), h, font=header_font, fill="#111111")
            text_bboxes.append(draw.textbbox((x + 12, 18), h, font=header_font))

        # Body rows
        for ri, row in enumerate(mod.rows):
            y = header_row_h + ri * row_h
            draw.rectangle(
                (0, y, self.COMPARISON_SIZE[0], y + row_h),
                outline="#EEEEEE",
                width=1,
            )
            draw.text((12, y + 12), row.label, font=label_font, fill="#111111")
            text_bboxes.append(
                draw.textbbox((12, y + 12), row.label, font=label_font)
            )
            for ci, cell in enumerate(row.cells[:n_cols]):
                x = label_col_w + ci * col_w
                draw.text((x + 12, y + 12), cell, font=cell_font, fill="#333333")
                text_bboxes.append(
                    draw.textbbox((x + 12, y + 12), cell, font=cell_font)
                )

        return self._finalise(canvas, APlusModuleType.comparison, text_bboxes)

    # ── finalise (compliance check + encode) ────────────────────

    def _finalise(
        self,
        canvas: Image.Image,
        module_type: APlusModuleType,
        text_bboxes: list[tuple[int, int, int, int]],
    ) -> RenderedModule:
        canvas_area = canvas.width * canvas.height
        text_area = sum(
            max(0, (x1 - x0)) * max(0, (y1 - y0)) for x0, y0, x1, y1 in text_bboxes
        )
        text_pct = text_area / canvas_area if canvas_area else 0.0
        if text_pct > self.MAX_TEXT_AREA_PCT:
            raise TextAreaTooLarge(
                f"text occupies {text_pct:.1%} > {self.MAX_TEXT_AREA_PCT:.0%} "
                f"limit for Amazon A+ Content (module={module_type.value})"
            )

        buf = io.BytesIO()
        canvas.save(buf, format="JPEG", quality=88, optimize=True)
        return RenderedModule(
            module_type=module_type,
            image_bytes=buf.getvalue(),
            mime="image/jpeg",
            width=canvas.width,
            height=canvas.height,
            text_area_pct=round(text_pct, 4),
        )

    # ── text helpers ──────────────────────────────────────────────

    @staticmethod
    def _wrap_text(
        text: str,
        font: ImageFont.ImageFont,
        width_px: int,
    ) -> str:
        """Greedy word-wrap for fixed-width caption blocks."""
        # PIL's getlength only exists on truetype; bitmap default lacks it.
        try:
            measure = font.getlength
        except AttributeError:
            return text  # bitmap default: no precise wrapping
        words = text.split()
        if not words:
            return text
        lines, current = [], words[0]
        for w in words[1:]:
            candidate = f"{current} {w}"
            if measure(candidate) <= width_px:
                current = candidate
            else:
                lines.append(current)
                current = w
        lines.append(current)
        return "\n".join(lines)
