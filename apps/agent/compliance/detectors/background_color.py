"""background_color detector.

The "is this a pure white background?" check. The single biggest reason
Amazon main images get rejected (PRD § 03 § 1.5).

Strategy: sample N pixels from each of the four image edges, compute the
Euclidean RGB distance from the target color, fail if any sampled pixel
exceeds `tolerance`.

Spec keys:
- `target_rgb` ([int, int, int], required): target colour, usually [255, 255, 255]
- `tolerance` (int, required): max per-channel deviation (Amazon uses ~2)
- `sample_zones` (str, optional, default "edges_4"):
    "edges_4"   — top, bottom, left, right strips
    "corners_4" — only the 4 corner regions
    "full"      — every pixel (expensive; for tiny images only)
- `strip_pct` (float, optional, default 0.05): width of edge strip as fraction
  of the longer side
- `sample_step` (int, optional, default 4): pixel step inside the sampled
  region (lower = more samples, slower)
"""

from __future__ import annotations

import io
import math
from typing import Iterable

from PIL import Image

from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


def _iter_sample_pixels(img: Image.Image, spec: dict) -> Iterable[tuple[int, int, int]]:
    w, h = img.size
    zones = spec.get("sample_zones", "edges_4")
    strip_pct = float(spec.get("strip_pct", 0.05))
    step = int(spec.get("sample_step", 4))
    strip = max(1, int(min(w, h) * strip_pct))

    px = img.load()  # type: ignore[assignment]

    def yield_box(x0: int, y0: int, x1: int, y1: int):
        for y in range(y0, y1, step):
            for x in range(x0, x1, step):
                p = px[x, y]
                # normalise to RGB tuple
                if isinstance(p, int):  # mode "L"
                    yield (p, p, p)
                elif len(p) == 4:  # RGBA / CMYK
                    yield (p[0], p[1], p[2])
                else:
                    yield (p[0], p[1], p[2])

    if zones == "full":
        yield from yield_box(0, 0, w, h)
        return
    if zones == "corners_4":
        c = strip
        yield from yield_box(0, 0, c, c)
        yield from yield_box(w - c, 0, w, c)
        yield from yield_box(0, h - c, c, h)
        yield from yield_box(w - c, h - c, w, h)
        return
    # default: edges_4
    yield from yield_box(0, 0, w, strip)            # top
    yield from yield_box(0, h - strip, w, h)        # bottom
    yield from yield_box(0, 0, strip, h)            # left
    yield from yield_box(w - strip, 0, w, h)        # right


@register_detector("background_color")
def background_color(ctx: DetectorContext, spec: dict) -> DetectorResult:
    target = spec.get("target_rgb")
    tol = spec.get("tolerance")
    if not (isinstance(target, list) and len(target) == 3 and tol is not None):
        return DetectorResult(
            passed=False,
            evidence={"error": "spec requires target_rgb=[R,G,B] and tolerance"},
        )
    tr, tg, tb = target
    tol_i = int(tol)

    with Image.open(io.BytesIO(ctx.image_bytes)) as img:
        # Coerce to RGB for consistent sampling (transparent PNGs flatten to white)
        if img.mode in ("RGBA", "LA"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            sample_img = bg
        else:
            sample_img = img.convert("RGB")

        max_dev = 0
        worst_pixel: tuple[int, int, int] | None = None
        total_sampled = 0
        violations = 0

        for r, g, b in _iter_sample_pixels(sample_img, spec):
            total_sampled += 1
            dr, dg, db = abs(r - tr), abs(g - tg), abs(b - tb)
            dev = max(dr, dg, db)
            if dev > max_dev:
                max_dev = dev
                worst_pixel = (r, g, b)
            if dev > tol_i:
                violations += 1

    passed = violations == 0
    # Euclidean distance for nicer reporting (per-channel max for pass/fail)
    eucl = (
        math.sqrt(sum((c - t) ** 2 for c, t in zip(worst_pixel, target)))
        if worst_pixel
        else 0.0
    )

    return DetectorResult(
        passed=passed,
        evidence={
            "target_rgb": target,
            "tolerance": tol_i,
            "max_per_channel_deviation": max_dev,
            "worst_sampled_pixel_rgb": list(worst_pixel) if worst_pixel else None,
            "worst_pixel_euclidean": round(eucl, 2),
            "sampled_pixels": total_sampled,
            "violating_pixels": violations,
            "violation_rate": (
                round(violations / total_sampled, 4) if total_sampled else 0
            ),
        },
    )
