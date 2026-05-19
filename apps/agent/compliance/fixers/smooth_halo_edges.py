"""smooth_halo_edges fixer (RGBA only).

After AI background removal, the alpha edge often has stair-stepping
or a faint colour halo. We feather the alpha by `alpha_feather_px`
pixels and gently soften the colour ring just outside the new alpha
to neutral white.

Spec:
- alpha_feather_px (int, optional, default 2): blur radius applied to alpha
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageFilter

from .registry import FixerResult, register_fixer


@register_fixer("smooth_halo_edges")
def smooth_halo_edges(image_bytes: bytes, mime: str, spec: dict) -> FixerResult:
    radius = int(spec.get("alpha_feather_px", 2))

    with Image.open(io.BytesIO(image_bytes)) as img:
        if img.mode != "RGBA":
            return FixerResult(
                image_bytes,
                mime,
                {
                    "applied": False,
                    "reason": "image is not RGBA; halo only meaningful for cut-outs",
                    "mode": img.mode,
                },
            )
        rgba = img.copy()

    r, g, b, a = rgba.split()
    # Feather alpha by a Gaussian blur — softens stair-step without losing
    # the silhouette's overall shape.
    a_smoothed = a.filter(ImageFilter.GaussianBlur(radius=radius))

    # Bias the colour channels of any sub-threshold-alpha pixel toward white
    # to kill colour halos picked up from the original background.
    rgb_arr = np.dstack([np.array(r), np.array(g), np.array(b)]).astype(np.int16)
    alpha_arr = np.array(a_smoothed).astype(np.int16)
    halo_mask = (alpha_arr > 0) & (alpha_arr < 200)
    if halo_mask.any():
        # Lerp toward white proportional to (200 - alpha)/200, clamped
        lerp = ((200 - np.clip(alpha_arr[halo_mask], 0, 200)) / 200)[:, None]
        rgb_arr[halo_mask] = (
            rgb_arr[halo_mask] * (1 - lerp) + 255 * lerp
        ).astype(np.int16)
    rgb_arr = np.clip(rgb_arr, 0, 255).astype(np.uint8)

    out = Image.merge(
        "RGBA",
        (
            Image.fromarray(rgb_arr[..., 0]),
            Image.fromarray(rgb_arr[..., 1]),
            Image.fromarray(rgb_arr[..., 2]),
            a_smoothed,
        ),
    )

    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return FixerResult(
        buf.getvalue(),
        "image/png",
        {"feather_radius_px": radius, "halo_pixels_softened": int(halo_mask.sum())},
    )
