"""object_count detector.

Catches "multiple products" / "props clutter" violations: Amazon main images
should show ONE product. Two bottles, a phone next to its case, decorative
plants — all reasons to suppress a listing.

Spec keys:
- `max_count` (int, required): maximum allowed detection count.
- `class_filter` (list[str], optional): only count these COCO class names.
  If null, count everything. Use to exclude "person" when there's a separate
  person_in_image rule with its own severity.
- `class_exclude` (list[str], optional): never count these classes.
  Common: ["person"] when paired with person_in_image rule.
- `min_confidence` (float, optional, default 0.7).
"""

from __future__ import annotations

from ..object_detection import detect_objects
from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


@register_detector("object_count")
def object_count(ctx: DetectorContext, spec: dict) -> DetectorResult:
    max_count = spec.get("max_count")
    if max_count is None:
        return DetectorResult(
            passed=False,
            evidence={"error": "spec requires max_count"},
        )
    min_conf = float(spec.get("min_confidence", 0.7))
    class_filter = spec.get("class_filter")  # may be None
    class_exclude = set(spec.get("class_exclude", []) or [])

    hits = detect_objects(ctx.image_bytes, min_confidence=min_conf)

    counted = [
        h
        for h in hits
        if (class_filter is None or h.label in class_filter)
        and h.label not in class_exclude
    ]

    passed = len(counted) <= int(max_count)

    # Group counts by class for human-readable evidence
    by_class: dict[str, int] = {}
    for h in counted:
        by_class[h.label] = by_class.get(h.label, 0) + 1

    return DetectorResult(
        passed=passed,
        evidence={
            "max_count": int(max_count),
            "actual_count": len(counted),
            "min_confidence": min_conf,
            "class_filter": class_filter,
            "class_exclude": list(class_exclude) if class_exclude else None,
            "counts_by_class": by_class,
            "samples": [
                {
                    "label": h.label,
                    "confidence": round(h.confidence, 3),
                    "bbox": h.bbox,
                }
                for h in counted[:8]
            ],
        },
    )
