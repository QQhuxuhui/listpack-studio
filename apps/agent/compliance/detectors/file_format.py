"""file_format detector.

Spec keys:
- `allowed` (list[str], required): MIME-type or short-name suffix list.
  Matched case-insensitively against ctx.mime (e.g. "jpeg" matches "image/jpeg").

Used by Amazon (JPEG/PNG/TIFF/non-animated GIF), Shopify (recommends WebP/AVIF),
all platforms ban SVG/PSD/RAW for product images.
"""

from __future__ import annotations

from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


def _format_aliases(name: str) -> set[str]:
    n = name.lower().strip()
    if "/" in n:  # full MIME like "image/jpeg"
        suffix = n.split("/", 1)[1]
        return {n, suffix}
    return {n, f"image/{n}", f"image/{n.replace('jpg', 'jpeg')}"}


@register_detector("file_format")
def file_format(ctx: DetectorContext, spec: dict) -> DetectorResult:
    allowed = spec.get("allowed") or []
    if not allowed:
        return DetectorResult(
            passed=False,
            evidence={"error": "spec.allowed must be a non-empty list"},
        )
    allowed_aliases: set[str] = set()
    for name in allowed:
        allowed_aliases |= _format_aliases(name)

    mime_lower = ctx.mime.lower().strip()
    passed = (
        mime_lower in allowed_aliases
        or mime_lower.split("/", 1)[-1] in allowed_aliases
    )

    return DetectorResult(
        passed=passed,
        evidence={
            "actual_mime": ctx.mime,
            "allowed": allowed,
        },
    )
