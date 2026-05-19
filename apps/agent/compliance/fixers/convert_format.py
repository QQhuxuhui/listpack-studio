"""convert_format fixer — re-encode to a different file format.

Spec:
- target_format (str, required): 'jpeg' | 'png' | 'webp' | 'tiff'
- quality (int, optional, default 92): for lossy formats
"""

from __future__ import annotations

import io

from PIL import Image

from .registry import FixerResult, register_fixer

_MIME_MAP = {
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "tiff": "image/tiff",
}

_FORMAT_MAP = {
    "jpeg": "JPEG",
    "jpg": "JPEG",
    "png": "PNG",
    "webp": "WEBP",
    "tiff": "TIFF",
}


@register_fixer("convert_format")
def convert_format(image_bytes: bytes, mime: str, spec: dict) -> FixerResult:
    target = spec["target_format"].lower()
    pil_format = _FORMAT_MAP.get(target)
    new_mime = _MIME_MAP.get(target)
    if not pil_format or not new_mime:
        raise ValueError(f"unsupported target_format: {target!r}")

    with Image.open(io.BytesIO(image_bytes)) as img:
        out_img = img
        if pil_format == "JPEG" and img.mode == "RGBA":
            # JPEG has no alpha; flatten RGBA over white background
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            out_img = bg

        buf = io.BytesIO()
        save_kwargs: dict = {}
        if pil_format in ("JPEG", "WEBP"):
            save_kwargs["quality"] = int(spec.get("quality", 92))
        if pil_format == "WEBP":
            save_kwargs.setdefault("method", 6)  # quality/speed tradeoff

        out_img.save(buf, format=pil_format, **save_kwargs)

    return FixerResult(
        buf.getvalue(),
        new_mime,
        {"from_mime": mime, "to_format": target, "from_mode": img.mode},
    )
