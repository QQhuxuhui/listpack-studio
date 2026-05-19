"""person_in_image detector.

Amazon main images forbid humans, hands, body parts, models, or mascots —
only the bare product is allowed. We use DETR to detect the "person" class.

Spec keys:
- `allowed` (bool, required): if false, ANY detected person → fail.
- `min_confidence` (float, optional, default 0.6): DETR confidence cutoff.
  Lower than OCR's 0.7 because subtle hand crops still need to be caught.
"""

from __future__ import annotations

from ..object_detection import detect_objects
from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


@register_detector("person_in_image")
def person_in_image(ctx: DetectorContext, spec: dict) -> DetectorResult:
    allowed = spec.get("allowed")
    if allowed is None:
        return DetectorResult(
            passed=False,
            evidence={"error": "spec.allowed must be set (true|false)"},
        )

    min_conf = float(spec.get("min_confidence", 0.6))

    hits = detect_objects(ctx.image_bytes, min_confidence=min_conf)
    persons = [h for h in hits if h.label == "person"]

    passed = bool(allowed) or len(persons) == 0

    return DetectorResult(
        passed=passed,
        evidence={
            "allowed": allowed,
            "min_confidence": min_conf,
            "person_count": len(persons),
            "persons": [
                {"confidence": round(p.confidence, 3), "bbox": p.bbox}
                for p in persons[:5]
            ],
        },
    )
