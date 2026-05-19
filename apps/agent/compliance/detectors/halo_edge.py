"""halo_edge detector.

After AI background removal (RMBG / Photoroom), the cut-out edges often have
a faint halo of original-background colour — "ringing" around hair, fur,
sheer fabric. Amazon's automated checker now catches these. We approximate
by measuring how often the gradient *outside* the product mask is non-zero.

Spec keys:
- `max_halo_intensity` (float, optional, default 0.15):
    Mean Sobel magnitude in the "halo band" (annulus just outside the mask),
    normalised by image max. Above this → fail.
- `halo_band_px` (int, optional, default 6):
    Width of the annulus outside the product mask we analyse.

Only meaningful on RGBA images with an actual alpha channel. RGB-only
images get a warn-evidence pass with `not_applicable: true`.
"""

from __future__ import annotations

import io

import cv2
import numpy as np
from PIL import Image

from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


@register_detector("halo_edge")
def halo_edge(ctx: DetectorContext, spec: dict) -> DetectorResult:
    max_intensity = float(spec.get("max_halo_intensity", 0.15))
    band_px = int(spec.get("halo_band_px", 6))

    with Image.open(io.BytesIO(ctx.image_bytes)) as img:
        if img.mode != "RGBA":
            return DetectorResult(
                passed=True,
                evidence={
                    "not_applicable": True,
                    "reason": "halo_edge only runs on RGBA images "
                    "(cut-out products); RGB images pass by default",
                    "mode": img.mode,
                },
            )
        rgba = np.array(img)

    alpha = rgba[..., 3]
    rgb = rgba[..., :3]

    # Mask = opaque; ring = pixels just outside the mask
    mask = (alpha > 200).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(mask, kernel, iterations=band_px)
    ring = cv2.bitwise_and(dilated, cv2.bitwise_not(mask))

    if ring.sum() == 0:
        return DetectorResult(
            passed=True,
            evidence={
                "halo_band_px": band_px,
                "ring_pixel_count": 0,
                "reason": "no usable halo band (mask spans full image?)",
            },
        )

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    sobel = np.hypot(
        cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3),
        cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3),
    )
    # Mean magnitude inside the ring, normalised by image max grad
    ring_mask = ring > 0
    ring_grad = sobel[ring_mask]
    grad_max = max(sobel.max(), 1.0)
    halo_intensity = float(ring_grad.mean() / grad_max)

    passed = halo_intensity <= max_intensity
    return DetectorResult(
        passed=passed,
        evidence={
            "halo_intensity": round(halo_intensity, 4),
            "max_allowed": max_intensity,
            "ring_pixel_count": int(ring_mask.sum()),
        },
    )
