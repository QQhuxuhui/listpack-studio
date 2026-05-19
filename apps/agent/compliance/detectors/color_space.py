"""color_space detector.

Spec keys:
- `allowed` (list[str], required): allowed color spaces. Normalised matches
  on Pillow's mode strings ("RGB", "RGBA", "CMYK", "L", ...) plus sRGB
  derived from ICC profile if available.

Used by Amazon (sRGB recommended; A+ Content RGB STRICTLY required —
CMYK uploads fail).
"""

from __future__ import annotations

from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


def _normalise(name: str) -> str:
    return name.replace("-", "").replace("_", "").lower()


@register_detector("color_space")
def color_space(ctx: DetectorContext, spec: dict) -> DetectorResult:
    allowed = spec.get("allowed") or []
    if not allowed:
        return DetectorResult(
            passed=False,
            evidence={"error": "spec.allowed must be a non-empty list"},
        )
    allowed_norm = {_normalise(a) for a in allowed}

    candidates: set[str] = set()
    if ctx.color_space:
        candidates.add(_normalise(ctx.color_space))
        # Pillow modes like "RGBA"/"RGB" all live in the sRGB color space when
        # no contrary ICC profile is embedded. Treat as sRGB by default.
        if ctx.color_space.upper().startswith("RGB"):
            candidates.add("srgb")
            candidates.add("rgb")
        if ctx.color_space.upper() == "CMYK":
            candidates.add("cmyk")

    passed = bool(candidates & allowed_norm)
    return DetectorResult(
        passed=passed,
        evidence={
            "pillow_mode": ctx.color_space,
            "has_icc": ctx.icc_profile is not None,
            "allowed": allowed,
        },
    )
