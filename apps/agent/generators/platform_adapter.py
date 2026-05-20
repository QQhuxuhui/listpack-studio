"""PlatformAdapter — one source image → many platform/slot outputs.

The adapter does NOT generate new pixels; it just resizes / pads / crops
the upstream image to match each (platform, slot) recipe pulled from a
small catalog. Heavier transformations (background change, scene shift)
live in ImageExecutor and run BEFORE the adapter.

Default recipes mirror PRD § 03 platform sections:
- Amazon main:      2000×2000 (zoom-friendly), JPEG, sRGB, white pad
- Amazon secondary: 1500×1500 same constraints
- Shopify hero:     2048×2048 sweet spot
- Temu main:        1600×1600 (>1600 long edge requirement)
- Temu portrait:    1600×2000 4:5 mobile-first
- SHEIN catalog:    900×1200 3:4 portrait
- eBay picture:     1600×1600

Output is always a `list[AdaptedImage]` so callers can write them all to
R2 in one batch.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from enum import Enum
from typing import Iterable, Literal

from PIL import Image


class PlatformSlot(str, Enum):
    amazon_main = "amazon.main"
    amazon_secondary = "amazon.secondary"
    amazon_a_plus_hero = "amazon.a_plus_hero"
    shopify_hero = "shopify.hero"
    shopify_thumbnail = "shopify.thumbnail"
    temu_main = "temu.main"
    temu_portrait = "temu.portrait"
    shein_catalog = "shein.catalog"
    ebay_picture = "ebay.picture"


# (width, height, fit_mode, format, quality)
@dataclass(frozen=True)
class SlotRecipe:
    width: int
    height: int
    # 'pad' — letterbox/pillarbox with `pad_color` to preserve aspect
    # 'cover' — fill target, crop overflow (uses bbox-aware crop if possible)
    # 'contain' — fit inside, may leave borders (we use 'pad' instead in v1)
    fit_mode: Literal["pad", "cover"] = "pad"
    fmt: Literal["JPEG", "PNG"] = "JPEG"
    quality: int = 92
    pad_color: tuple[int, int, int] = (255, 255, 255)


SLOT_CATALOG: dict[PlatformSlot, SlotRecipe] = {
    PlatformSlot.amazon_main: SlotRecipe(2000, 2000, "pad", "JPEG", 92),
    PlatformSlot.amazon_secondary: SlotRecipe(1500, 1500, "pad", "JPEG", 90),
    PlatformSlot.amazon_a_plus_hero: SlotRecipe(970, 600, "cover", "JPEG", 88),
    PlatformSlot.shopify_hero: SlotRecipe(2048, 2048, "pad", "JPEG", 90),
    PlatformSlot.shopify_thumbnail: SlotRecipe(800, 800, "pad", "JPEG", 85),
    PlatformSlot.temu_main: SlotRecipe(1600, 1600, "pad", "JPEG", 90),
    PlatformSlot.temu_portrait: SlotRecipe(1600, 2000, "pad", "JPEG", 90),
    PlatformSlot.shein_catalog: SlotRecipe(900, 1200, "pad", "JPEG", 90),
    PlatformSlot.ebay_picture: SlotRecipe(1600, 1600, "pad", "JPEG", 90),
}


@dataclass
class AdaptedImage:
    slot: PlatformSlot
    bytes_data: bytes
    mime: str
    width: int
    height: int
    fit_mode: str
    source_size: tuple[int, int]


class PlatformAdapter:
    """Stateless resize/pad/crop adapter."""

    def __init__(self, catalog: dict[PlatformSlot, SlotRecipe] | None = None) -> None:
        self._catalog = catalog or dict(SLOT_CATALOG)

    def adapt(
        self,
        source_bytes: bytes,
        slots: Iterable[PlatformSlot],
    ) -> list[AdaptedImage]:
        out: list[AdaptedImage] = []
        with Image.open(io.BytesIO(source_bytes)) as src:
            src_rgb = self._flatten_to_rgb(src)
            src_size = src.size

        for slot in slots:
            recipe = self._catalog.get(slot)
            if recipe is None:
                raise ValueError(f"unknown slot: {slot!r}")
            out.append(self._render_one(src_rgb, slot, recipe, src_size))

        return out

    def adapt_all_platforms(
        self,
        source_bytes: bytes,
        platforms: Iterable[str],
    ) -> list[AdaptedImage]:
        """Convenience: turn ['amazon', 'shopify'] into every catalog slot
        for those platforms."""
        wanted_prefixes = {p.lower() for p in platforms}
        slots = [
            s for s in self._catalog
            if s.value.split(".", 1)[0] in wanted_prefixes
        ]
        return self.adapt(source_bytes, slots)

    # ── internals ────────────────────────────────────────────────

    @staticmethod
    def _flatten_to_rgb(img: Image.Image) -> Image.Image:
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            return bg
        if img.mode != "RGB":
            return img.convert("RGB")
        return img.copy()

    def _render_one(
        self,
        src: Image.Image,
        slot: PlatformSlot,
        recipe: SlotRecipe,
        src_size: tuple[int, int],
    ) -> AdaptedImage:
        target = (recipe.width, recipe.height)
        if recipe.fit_mode == "pad":
            out = self._fit_pad(src, target, recipe.pad_color)
        else:
            out = self._fit_cover(src, target)

        buf = io.BytesIO()
        save_kwargs: dict = {}
        if recipe.fmt == "JPEG":
            save_kwargs["quality"] = recipe.quality
            save_kwargs["optimize"] = True
        out.save(buf, format=recipe.fmt, **save_kwargs)

        mime = f"image/{recipe.fmt.lower()}"
        return AdaptedImage(
            slot=slot,
            bytes_data=buf.getvalue(),
            mime=mime,
            width=recipe.width,
            height=recipe.height,
            fit_mode=recipe.fit_mode,
            source_size=src_size,
        )

    @staticmethod
    def _fit_pad(
        src: Image.Image,
        target: tuple[int, int],
        pad_color: tuple[int, int, int],
    ) -> Image.Image:
        tw, th = target
        iw, ih = src.size
        ratio = min(tw / iw, th / ih)
        new_size = (max(1, int(round(iw * ratio))), max(1, int(round(ih * ratio))))
        resized = src.resize(new_size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", target, pad_color)
        off = ((tw - new_size[0]) // 2, (th - new_size[1]) // 2)
        canvas.paste(resized, off)
        return canvas

    @staticmethod
    def _fit_cover(src: Image.Image, target: tuple[int, int]) -> Image.Image:
        tw, th = target
        iw, ih = src.size
        ratio = max(tw / iw, th / ih)
        new_size = (max(1, int(round(iw * ratio))), max(1, int(round(ih * ratio))))
        resized = src.resize(new_size, Image.Resampling.LANCZOS)
        x = (resized.width - tw) // 2
        y = (resized.height - th) // 2
        return resized.crop((x, y, x + tw, y + th))
