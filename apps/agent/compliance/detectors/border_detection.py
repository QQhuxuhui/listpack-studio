"""border_detection detector.

Amazon / eBay reject images with visible borders (decorative frames,
coloured strips, watermark bars). Detected via two complementary heuristics:

1. **Hough line detection** on Canny edges — catches sharp rectangular frames
2. **Edge strip colour uniformity** — catches solid-colour borders even when
   they're seamless against the product (Hough misses these)

Spec keys:
- `tolerance_px` (int, optional, default 3):
    A detected line within `tolerance_px` of the image edge counts as a border.
- `min_edge_uniformity` (float, optional, default 0.95):
    If ≥ this fraction of any edge strip is the same colour AND that colour
    differs from the image's dominant background, flag as a coloured border.
- `strip_pct` (float, optional, default 0.02):
    Width of the analysed edge strip as a fraction of the shorter side.
"""

from __future__ import annotations

import io

import cv2
import numpy as np
from PIL import Image

from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


def _detect_hough_borders(
    gray: np.ndarray, tolerance_px: int
) -> list[tuple[str, int]]:
    """Return list of (edge_name, line_pos) for lines hugging an edge."""
    h, w = gray.shape
    edges = cv2.Canny(gray, 50, 150)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=int(min(w, h) * 0.3),
        minLineLength=int(min(w, h) * 0.5),
        maxLineGap=10,
    )
    found: list[tuple[str, int]] = []
    if lines is None:
        return found
    for ln in lines[:, 0, :]:
        x1, y1, x2, y2 = ln
        # horizontal-ish
        if abs(y1 - y2) <= 2:
            ymid = (y1 + y2) // 2
            if ymid <= tolerance_px:
                found.append(("top", int(ymid)))
            elif ymid >= h - 1 - tolerance_px:
                found.append(("bottom", int(ymid)))
        # vertical-ish
        if abs(x1 - x2) <= 2:
            xmid = (x1 + x2) // 2
            if xmid <= tolerance_px:
                found.append(("left", int(xmid)))
            elif xmid >= w - 1 - tolerance_px:
                found.append(("right", int(xmid)))
    return found


def _detect_uniform_color_strips(
    rgb: np.ndarray, strip_pct: float, min_uniformity: float
) -> list[dict]:
    """Find edge strips whose pixels are >min_uniformity the same color."""
    h, w = rgb.shape[:2]
    strip = max(1, int(min(w, h) * strip_pct))
    findings: list[dict] = []

    BUCKET_BITS = 3  # drop 3 LSBs → bucket size 8, 32 levels per channel
    BUCKET_MASK = (0xFF >> BUCKET_BITS) << BUCKET_BITS  # 0b11111000
    BUCKET_CENTER = 1 << (BUCKET_BITS - 1)  # +4 to land in the middle of the bucket

    def analyse(name: str, region: np.ndarray):
        # Flatten to (N, 3) and bucket per channel so anti-aliasing variations
        # collapse to one colour. Bucket size 8 → 32^3 ≈ 32K colour buckets;
        # plenty to distinguish white from light grey but quantises away jpeg noise.
        pix = (region.reshape(-1, 3) & BUCKET_MASK).astype(np.uint32)
        if pix.size == 0:
            return
        # Pack RGB into a single uint32 (R | G<<8 | B<<16) so np.unique can count
        # distinct colours in O(N log N). We can't use .view(uint32) here because
        # 3 bytes can't be reinterpreted as 4 bytes.
        packed = pix[:, 0] | (pix[:, 1] << 8) | (pix[:, 2] << 16)
        unique, counts = np.unique(packed, return_counts=True)
        dom_count = int(counts.max())
        uniformity = dom_count / packed.shape[0]
        if uniformity >= min_uniformity:
            dom_packed = int(unique[counts.argmax()])
            # Recentre bucket-aligned colour to the bucket midpoint so the
            # reported dominant_rgb is closer to the true pixel value
            r = (dom_packed & 0xFF) + BUCKET_CENTER
            g = ((dom_packed >> 8) & 0xFF) + BUCKET_CENTER
            b = ((dom_packed >> 16) & 0xFF) + BUCKET_CENTER
            findings.append(
                {
                    "edge": name,
                    "uniformity": round(float(uniformity), 4),
                    "dominant_rgb": [int(r), int(g), int(b)],
                }
            )

    analyse("top", rgb[:strip, :, :])
    analyse("bottom", rgb[-strip:, :, :])
    analyse("left", rgb[:, :strip, :])
    analyse("right", rgb[:, -strip:, :])
    return findings


@register_detector("border_detection")
def border_detection(ctx: DetectorContext, spec: dict) -> DetectorResult:
    tolerance_px = int(spec.get("tolerance_px", 3))
    min_uniformity = float(spec.get("min_edge_uniformity", 0.95))
    strip_pct = float(spec.get("strip_pct", 0.02))

    with Image.open(io.BytesIO(ctx.image_bytes)) as img:
        if img.mode != "RGB":
            img = img.convert("RGB")
        rgb = np.array(img)

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    hough_hits = _detect_hough_borders(gray, tolerance_px)
    uniform_hits = _detect_uniform_color_strips(rgb, strip_pct, min_uniformity)

    # A border by uniform colour ONLY counts if that colour differs from white —
    # white-background main images should pass this check trivially.
    coloured = [
        h
        for h in uniform_hits
        if max(abs(c - 255) for c in h["dominant_rgb"]) > 10
    ]

    passed = not hough_hits and not coloured
    return DetectorResult(
        passed=passed,
        evidence={
            "hough_edge_lines": hough_hits,
            "uniform_color_strips": uniform_hits,
            "coloured_border_strips": coloured,
            "tolerance_px": tolerance_px,
            "min_edge_uniformity": min_uniformity,
        },
    )
