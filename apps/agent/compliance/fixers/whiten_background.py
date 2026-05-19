"""whiten_background fixer.

Two modes:
- 'ai_remove_bg' (v1.5+): call an external segmentation API (Replicate SAM
  + post-processing or briaai/RMBG-2.0). Surfaces an explicit
  not-implemented error when REPLICATE_API_TOKEN is missing.
- 'white_threshold' (v1, default, offline): treat any pixel within
  bg_tolerance of pure white as background and force it to (255,255,255).
  Good enough for studio shots that are 'almost white' (#f8f8f8 → #fff)
  and unblocks Amazon's strict `background_white` rule without an API call.

Spec:
- method (str, optional, default 'white_threshold'): see above
- bg_tolerance (int, optional, default 15)
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

from .registry import FixerResult, register_fixer


def _white_threshold(image_bytes: bytes, tolerance: int) -> tuple[bytes, dict]:
    with Image.open(io.BytesIO(image_bytes)) as img:
        # Flatten any alpha onto white first so the threshold makes sense.
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            rgb = bg
        else:
            rgb = img.convert("RGB")
        arr = np.array(rgb)

    # Per-channel deviation from white
    dist = np.max(255 - arr.astype(np.int16), axis=2)
    mask = dist <= tolerance  # True = near-white → snap to pure white

    arr[mask] = 255
    changed_px = int(mask.sum())
    total_px = int(arr.shape[0] * arr.shape[1])

    out = Image.fromarray(arr.astype(np.uint8), mode="RGB")
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=92, optimize=True)
    return (
        buf.getvalue(),
        {
            "method": "white_threshold",
            "tolerance": tolerance,
            "pixels_snapped_to_white": changed_px,
            "snap_rate": round(changed_px / total_px, 4),
        },
    )


@register_fixer("whiten_background")
def whiten_background(image_bytes: bytes, mime: str, spec: dict) -> FixerResult:
    method = spec.get("method", "white_threshold")

    if method == "white_threshold":
        tolerance = int(spec.get("bg_tolerance", 15))
        out_bytes, metadata = _white_threshold(image_bytes, tolerance)
        return FixerResult(out_bytes, "image/jpeg", metadata)

    if method == "ai_remove_bg":
        # Defer to D12.5 — needs REPLICATE_API_TOKEN + SAM/RMBG client.
        return FixerResult(
            image_bytes,
            mime,
            {
                "method": "ai_remove_bg",
                "applied": False,
                "error": "ai_remove_bg not yet implemented",
                "hint": "configure REPLICATE_API_TOKEN and a SAM/RMBG client in D12.5",
            },
        )

    raise ValueError(f"unsupported whiten_background method: {method!r}")
