"""file_size detector.

Spec keys:
- `max_bytes` (int, required): hard upper limit, file size must be ≤
- `min_bytes` (int, optional): some platforms reject suspiciously small files

Used by Amazon main image (≤10MB), Shopify product (≤200KB), Temu (≤5MB),
SHEIN (≤3MB), etc.
"""

from __future__ import annotations

from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


@register_detector("file_size")
def file_size(ctx: DetectorContext, spec: dict) -> DetectorResult:
    max_bytes = spec.get("max_bytes")
    min_bytes = spec.get("min_bytes")
    evidence = {"actual_bytes": ctx.file_size, "spec": spec}

    if max_bytes is None and min_bytes is None:
        return DetectorResult(
            passed=False,
            evidence={**evidence, "error": "spec requires max_bytes or min_bytes"},
        )

    if max_bytes is not None and ctx.file_size > int(max_bytes):
        return DetectorResult(passed=False, evidence=evidence)
    if min_bytes is not None and ctx.file_size < int(min_bytes):
        return DetectorResult(passed=False, evidence=evidence)

    return DetectorResult(passed=True, evidence=evidence)
