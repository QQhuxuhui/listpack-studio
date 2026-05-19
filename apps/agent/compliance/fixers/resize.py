"""resize fixer — bring longest side to `target_long_edge`, preserve aspect.

Spec:
- target_long_edge (int, required)
- resample (str, optional, default 'lanczos'): 'lanczos'|'bicubic'|'bilinear'|'nearest'
"""

from __future__ import annotations

import io

from PIL import Image

from .registry import FixerResult, register_fixer

_RESAMPLE_MAP = {
    "lanczos": Image.Resampling.LANCZOS,
    "bicubic": Image.Resampling.BICUBIC,
    "bilinear": Image.Resampling.BILINEAR,
    "nearest": Image.Resampling.NEAREST,
}


@register_fixer("resize")
def resize(image_bytes: bytes, mime: str, spec: dict) -> FixerResult:
    target = int(spec["target_long_edge"])
    resample = _RESAMPLE_MAP.get(spec.get("resample", "lanczos"), Image.Resampling.LANCZOS)

    with Image.open(io.BytesIO(image_bytes)) as img:
        w, h = img.size
        long_edge = max(w, h)
        if long_edge == target:
            # No-op — return original bytes verbatim
            return FixerResult(
                image_bytes,
                mime,
                {"reason": "already at target", "width": w, "height": h},
            )
        scale = target / long_edge
        new_w, new_h = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
        out = img.resize((new_w, new_h), resample=resample)
        buf = io.BytesIO()
        fmt = (img.format or "JPEG").upper()
        save_kwargs: dict = {}
        if fmt == "JPEG":
            save_kwargs["quality"] = 92
            if out.mode == "RGBA":
                out = out.convert("RGB")
        out.save(buf, format=fmt, **save_kwargs)

    return FixerResult(
        buf.getvalue(),
        mime,
        {
            "from": [w, h],
            "to": [new_w, new_h],
            "resample": spec.get("resample", "lanczos"),
        },
    )
