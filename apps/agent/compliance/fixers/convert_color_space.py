"""convert_color_space fixer — flatten to a target colorspace.

Spec:
- target (str, required): 'srgb' | 'rgb' (current default Pillow mode 'RGB' ≈ sRGB)

For CMYK→sRGB we use Pillow's built-in conversion path. For fancier
ICC-profile remapping we'd need littlecms (ImageCms), but v1 callers
only ever need to escape CMYK and that route is reliable.
"""

from __future__ import annotations

import io

from PIL import Image

from .registry import FixerResult, register_fixer


@register_fixer("convert_color_space")
def convert_color_space(image_bytes: bytes, mime: str, spec: dict) -> FixerResult:
    target = spec["target"].lower()
    if target not in {"srgb", "rgb"}:
        raise ValueError(f"unsupported target color space: {target!r}")

    with Image.open(io.BytesIO(image_bytes)) as img:
        mode_before = img.mode
        if img.mode == "RGB" and target in {"srgb", "rgb"}:
            return FixerResult(
                image_bytes,
                mime,
                {"reason": "already RGB", "mode": mode_before},
            )
        out = img.convert("RGB")
        buf = io.BytesIO()
        fmt = (img.format or "JPEG").upper()
        save_kwargs: dict = {}
        if fmt == "JPEG":
            save_kwargs["quality"] = 92
        out.save(buf, format=fmt, **save_kwargs)

    return FixerResult(
        buf.getvalue(),
        mime,
        {"mode_before": mode_before, "mode_after": "RGB"},
    )
