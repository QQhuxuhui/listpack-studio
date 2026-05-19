"""product_fill_ratio detector.

Measures what fraction of the image the product occupies. Amazon main images
require ≥85%.

Two segmentation modes — chosen via `spec.method`:

- `"white_threshold"` (default, offline, free):
    Treat any pixel within `bg_tolerance` of pure white as background.
    Compute the bbox of non-background pixels. Best for white-background
    studio shots — the Amazon main image case. Doesn't need GPU/API.

- `"alpha_channel"` (offline, free, requires RGBA):
    Use the image's alpha channel directly as the product mask. Best for
    pre-cut PNGs returned by AI background removal.

- `"sam_segmentation"` (D6.5 upgrade, uses Replicate API):
    NOT YET IMPLEMENTED — placeholder for SAM 2.1 integration once
    REPLICATE_API_TOKEN is wired in. Returns warn-level evidence pointing
    at the missing implementation so misconfigured rules surface clearly.

Spec keys:
- `min_ratio` (float, required): pass threshold, e.g. 0.85
- `method` (str, optional, default "white_threshold")
- `bg_tolerance` (int, optional, default 5): how far from white still counts
  as background (only `white_threshold` mode)
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


def _bbox_from_mask(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """Return (x0, y0, x1, y1) inclusive bounding box of True pixels, or None."""
    if not mask.any():
        return None
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def _white_threshold_mask(rgb: np.ndarray, tolerance: int) -> np.ndarray:
    """True where pixel is NOT near-white (i.e. is product)."""
    # rgb shape (H, W, 3) uint8
    dist = np.max(np.abs(rgb.astype(np.int16) - 255), axis=2)
    return dist > tolerance


def _alpha_channel_mask(rgba: np.ndarray, alpha_threshold: int = 32) -> np.ndarray:
    """True where alpha > threshold (i.e. opaque enough to count as product)."""
    return rgba[..., 3] > alpha_threshold


@register_detector("product_fill_ratio")
def product_fill_ratio(ctx: DetectorContext, spec: dict) -> DetectorResult:
    method = spec.get("method", "white_threshold")
    min_ratio = spec.get("min_ratio")
    if min_ratio is None:
        return DetectorResult(
            passed=False,
            evidence={"error": "spec requires min_ratio"},
        )

    with Image.open(io.BytesIO(ctx.image_bytes)) as img:
        if method == "sam_segmentation":
            # Not implemented yet; surface as warn with explicit message.
            return DetectorResult(
                passed=False,
                evidence={
                    "error": "sam_segmentation not yet implemented",
                    "hint": "configure REPLICATE_API_TOKEN and switch method "
                    "to sam_segmentation in D6.5; falling back to white_threshold "
                    "is recommended for now",
                    "method_requested": method,
                },
            )

        if method == "alpha_channel":
            if img.mode != "RGBA":
                return DetectorResult(
                    passed=False,
                    evidence={
                        "error": "alpha_channel mode requires RGBA image",
                        "actual_mode": img.mode,
                    },
                )
            arr = np.array(img)
            mask = _alpha_channel_mask(arr, int(spec.get("alpha_threshold", 32)))
        else:
            # default: white_threshold
            if img.mode != "RGB":
                if img.mode == "RGBA":
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    bg.paste(img, mask=img.split()[-1])
                    img = bg
                else:
                    img = img.convert("RGB")
            arr = np.array(img)
            mask = _white_threshold_mask(arr, int(spec.get("bg_tolerance", 5)))

        bbox = _bbox_from_mask(mask)
        if bbox is None:
            return DetectorResult(
                passed=False,
                evidence={
                    "error": "no product detected — image looks uniformly like background",
                    "method": method,
                    "min_ratio": min_ratio,
                    "fill_ratio": 0.0,
                },
            )
        x0, y0, x1, y1 = bbox
        w_bbox = x1 - x0 + 1
        h_bbox = y1 - y0 + 1
        ratio_w = w_bbox / ctx.width
        ratio_h = h_bbox / ctx.height
        fill_ratio = max(ratio_w, ratio_h)

    passed = fill_ratio >= float(min_ratio)
    return DetectorResult(
        passed=passed,
        evidence={
            "method": method,
            "min_ratio": float(min_ratio),
            "fill_ratio": round(fill_ratio, 4),
            "bbox": [int(x0), int(y0), int(x1), int(y1)],
            "bbox_width_ratio": round(ratio_w, 4),
            "bbox_height_ratio": round(ratio_h, 4),
        },
    )
