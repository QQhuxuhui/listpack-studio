"""compress fixer — re-encode to land under `target_bytes`.

Strategy:
1. Try the spec'd `quality` first.
2. If still too big, step quality down by 5 until under target or quality < 50.
3. Last resort: downscale by 10% and retry (still preserves enough quality
   that catalog images stay sharp).

Spec:
- target_bytes (int, required): hard upper limit on output size.
- quality (int, optional, default 85): starting JPEG quality.
"""

from __future__ import annotations

import io

from PIL import Image

from .registry import FixerResult, register_fixer

MIN_QUALITY = 50


def _encode(img: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    rgb = img.convert("RGB") if img.mode == "RGBA" else img
    rgb.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


@register_fixer("compress")
def compress(image_bytes: bytes, mime: str, spec: dict) -> FixerResult:
    target = int(spec["target_bytes"])
    quality = int(spec.get("quality", 85))

    if len(image_bytes) <= target:
        return FixerResult(
            image_bytes, mime, {"reason": "already under target", "size": len(image_bytes)}
        )

    with Image.open(io.BytesIO(image_bytes)) as img:
        steps: list[tuple[int, float, int]] = []  # (quality, scale, size)

        # Phase 1 — quality ladder at original dimensions
        for q in range(quality, MIN_QUALITY - 1, -5):
            out = _encode(img, q)
            steps.append((q, 1.0, len(out)))
            if len(out) <= target:
                return FixerResult(
                    out,
                    "image/jpeg",
                    {
                        "from_size": len(image_bytes),
                        "to_size": len(out),
                        "quality": q,
                        "scale": 1.0,
                        "attempts": steps,
                    },
                )

        # Phase 2 — downscale 10% per step, keep MIN_QUALITY constant
        scale = 0.9
        while scale >= 0.5:
            w, h = img.size
            small = img.resize(
                (max(1, int(w * scale)), max(1, int(h * scale))),
                resample=Image.Resampling.LANCZOS,
            )
            out = _encode(small, MIN_QUALITY)
            steps.append((MIN_QUALITY, scale, len(out)))
            if len(out) <= target:
                return FixerResult(
                    out,
                    "image/jpeg",
                    {
                        "from_size": len(image_bytes),
                        "to_size": len(out),
                        "quality": MIN_QUALITY,
                        "scale": scale,
                        "attempts": steps,
                    },
                )
            scale -= 0.1

        # Best-effort — return smallest attempt
        # (Detector will re-run and flag; user gets a clear "couldn't shrink" report)
        smallest = min(steps, key=lambda s: s[2])
        out = _encode(
            img.resize(
                (max(1, int(img.width * smallest[1])), max(1, int(img.height * smallest[1]))),
                resample=Image.Resampling.LANCZOS,
            ),
            smallest[0],
        )
        return FixerResult(
            out,
            "image/jpeg",
            {
                "from_size": len(image_bytes),
                "to_size": len(out),
                "quality": smallest[0],
                "scale": smallest[1],
                "achieved_target": False,
                "attempts": steps,
            },
        )
