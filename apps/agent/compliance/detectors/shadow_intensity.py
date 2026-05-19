"""shadow_intensity detector.

A heavy drop-shadow under a product reads as a "black border" to Amazon's
checker and gets the listing suppressed. We measure the fraction of dark
pixels (luminance < threshold) and flag overly-shadowed images.

Spec keys:
- `max_dark_pct` (float, optional, default 0.20):
    Maximum allowed fraction of pixels with luminance below `dark_lum_threshold`.
- `dark_lum_threshold` (int, optional, default 60):
    Per-pixel luma cutoff (0-255) below which a pixel is "dark".
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


@register_detector("shadow_intensity")
def shadow_intensity(ctx: DetectorContext, spec: dict) -> DetectorResult:
    max_dark_pct = float(spec.get("max_dark_pct", 0.20))
    dark_threshold = int(spec.get("dark_lum_threshold", 60))

    with Image.open(io.BytesIO(ctx.image_bytes)) as img:
        if img.mode != "RGB":
            if img.mode == "RGBA":
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[-1])
                img = bg
            else:
                img = img.convert("RGB")
        rgb = np.array(img)

    # Rec.601 luma — close enough to perceptual brightness for thresholding
    lum = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]).astype(np.uint8)
    dark_pixels = int((lum < dark_threshold).sum())
    total = lum.size
    dark_pct = dark_pixels / total

    passed = dark_pct <= max_dark_pct
    return DetectorResult(
        passed=passed,
        evidence={
            "dark_pixel_pct": round(dark_pct, 4),
            "max_allowed_pct": max_dark_pct,
            "dark_lum_threshold": dark_threshold,
            "dark_pixel_count": dark_pixels,
            "total_pixel_count": total,
        },
    )
