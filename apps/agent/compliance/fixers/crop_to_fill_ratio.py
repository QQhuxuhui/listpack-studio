"""crop_to_fill_ratio fixer.

Detect the product's bounding box (same white_threshold logic as
`product_fill_ratio` detector), then crop the image so the bbox occupies
`target_ratio` of the longer side. Pads with white when the source aspect
won't allow a tighter crop without distorting.

Spec:
- target_ratio (float, optional, default 0.87): how much of the longer side
  the product should fill after the crop
- preserve_subject (bool, optional, default True): never crop INTO the bbox,
  only the margins around it
- bg_tolerance (int, optional, default 5): how white "background" is
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

from .registry import FixerResult, register_fixer


def _bbox_from_white_threshold(rgb: np.ndarray, tolerance: int) -> tuple[int, int, int, int] | None:
    dist = np.max(255 - rgb.astype(np.int16), axis=2)
    mask = dist > tolerance
    if not mask.any():
        return None
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


@register_fixer("crop_to_fill_ratio")
def crop_to_fill_ratio(image_bytes: bytes, mime: str, spec: dict) -> FixerResult:
    target_ratio = float(spec.get("target_ratio", 0.87))
    preserve = bool(spec.get("preserve_subject", True))
    tolerance = int(spec.get("bg_tolerance", 5))

    if not (0 < target_ratio <= 1):
        raise ValueError(f"target_ratio must be in (0, 1]: got {target_ratio}")

    with Image.open(io.BytesIO(image_bytes)) as img:
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            rgb = bg
        else:
            rgb = img.convert("RGB")
        arr = np.array(rgb)
        h, w = arr.shape[:2]

    bbox = _bbox_from_white_threshold(arr, tolerance)
    if bbox is None:
        return FixerResult(
            image_bytes,
            mime,
            {
                "applied": False,
                "reason": "no product detected (image appears uniformly background)",
            },
        )

    x0, y0, x1, y1 = bbox
    bbox_w, bbox_h = x1 - x0 + 1, y1 - y0 + 1

    # We pick a square output centred on the bbox sized so bbox fills target_ratio
    long_bbox = max(bbox_w, bbox_h)
    target_canvas = int(round(long_bbox / target_ratio))

    # Centre point of the bbox
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    half = target_canvas // 2

    # Initial crop window
    crop_x0, crop_y0 = cx - half, cy - half
    crop_x1, crop_y1 = crop_x0 + target_canvas, crop_y0 + target_canvas

    # Clamp to image; if `preserve_subject`, never let the window cut the bbox.
    if preserve:
        crop_x0 = min(crop_x0, x0)
        crop_y0 = min(crop_y0, y0)
        crop_x1 = max(crop_x1, x1 + 1)
        crop_y1 = max(crop_y1, y1 + 1)

    # Pad with white if the desired crop falls outside the image
    pad_left = max(0, -crop_x0)
    pad_top = max(0, -crop_y0)
    pad_right = max(0, crop_x1 - w)
    pad_bottom = max(0, crop_y1 - h)

    if any((pad_left, pad_top, pad_right, pad_bottom)):
        padded = Image.new(
            "RGB",
            (w + pad_left + pad_right, h + pad_top + pad_bottom),
            (255, 255, 255),
        )
        padded.paste(Image.fromarray(arr, "RGB"), (pad_left, pad_top))
        src = padded
        crop_x0 += pad_left
        crop_x1 += pad_left
        crop_y0 += pad_top
        crop_y1 += pad_top
    else:
        src = Image.fromarray(arr, "RGB")

    out = src.crop((crop_x0, crop_y0, crop_x1, crop_y1))

    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=92, optimize=True)

    return FixerResult(
        buf.getvalue(),
        "image/jpeg",
        {
            "original_size": [w, h],
            "bbox": [x0, y0, x1, y1],
            "crop_window": [crop_x0, crop_y0, crop_x1, crop_y1],
            "padded": [pad_left, pad_top, pad_right, pad_bottom],
            "target_ratio": target_ratio,
        },
    )
