"""pixel_dimension detector.

Spec keys (all optional, at least one required):
- `min_long_edge` (int): the longer side of the image must be ≥ this
- `max_long_edge` (int): the longer side must be ≤ this
- `min_short_edge`, `max_short_edge` (int): same for the shorter side
- `exact` ([int, int]): image must be exactly W×H (order-insensitive)

Used by Amazon main-image rules (>=1000px), Temu (>=1600), eBay (>=500), etc.
"""

from __future__ import annotations

from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


@register_detector("pixel_dimension")
def pixel_dimension(ctx: DetectorContext, spec: dict) -> DetectorResult:
    long_edge = max(ctx.width, ctx.height)
    short_edge = min(ctx.width, ctx.height)
    evidence = {
        "width": ctx.width,
        "height": ctx.height,
        "long_edge": long_edge,
        "short_edge": short_edge,
        "spec": spec,
    }

    if "exact" in spec:
        exact = spec["exact"]
        if not (isinstance(exact, list) and len(exact) == 2):
            return DetectorResult(passed=False, evidence={**evidence, "error": "exact must be [w, h]"})
        ew, eh = sorted(exact)
        if {ew, eh} != {short_edge, long_edge}:
            return DetectorResult(passed=False, evidence=evidence)

    if (m := spec.get("min_long_edge")) is not None and long_edge < m:
        return DetectorResult(passed=False, evidence=evidence)
    if (m := spec.get("max_long_edge")) is not None and long_edge > m:
        return DetectorResult(passed=False, evidence=evidence)
    if (m := spec.get("min_short_edge")) is not None and short_edge < m:
        return DetectorResult(passed=False, evidence=evidence)
    if (m := spec.get("max_short_edge")) is not None and short_edge > m:
        return DetectorResult(passed=False, evidence=evidence)

    return DetectorResult(passed=True, evidence=evidence)
