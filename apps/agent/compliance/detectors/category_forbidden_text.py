"""category_forbidden_text detector.

Catches category-specific banned phrases on a product image. Examples:
- supplements: "cure", "treat", "heal", "治愈", "治疗"
- cosmetics:  "wrinkle reduction", "acne treatment", "去皱", "祛痘"
- food:       "organic", "natural", "有机", "纯天然" (unless certified)

Compared with `text_in_image`, this allows text in general but blocks
specific phrases. Used in category rules that apply across platforms.

Spec keys:
- `keywords` (list[str], required): phrases to flag. Substring match
  (case-insensitive unless `case_sensitive=true`).
- `min_confidence` (float, optional, default 0.6): OCR confidence threshold.
- `case_sensitive` (bool, optional, default false).

Evidence includes which keyword(s) matched, in which OCR'd text, with bbox.
"""

from __future__ import annotations

from ..ocr import extract_text
from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


@register_detector("category_forbidden_text")
def category_forbidden_text(ctx: DetectorContext, spec: dict) -> DetectorResult:
    keywords = spec.get("keywords") or []
    if not keywords:
        return DetectorResult(
            passed=False,
            evidence={"error": "spec.keywords must be a non-empty list"},
        )
    min_conf = float(spec.get("min_confidence", 0.6))
    case_sensitive = bool(spec.get("case_sensitive", False))

    hits = extract_text(ctx.image_bytes, min_confidence=min_conf)

    matched: list[dict] = []
    for h in hits:
        haystack = h.text if case_sensitive else h.text.lower()
        for kw in keywords:
            needle = kw if case_sensitive else kw.lower()
            if needle in haystack:
                matched.append(
                    {
                        "keyword": kw,
                        "found_in_text": h.text,
                        "confidence": round(h.confidence, 3),
                        "bbox": h.bbox,
                    }
                )
                break  # one match per OCR hit is enough

    passed = len(matched) == 0
    return DetectorResult(
        passed=passed,
        evidence={
            "checked_keywords_count": len(keywords),
            "case_sensitive": case_sensitive,
            "min_confidence": min_conf,
            "ocr_hit_count": len(hits),
            "matched_count": len(matched),
            "matches": matched[:10],
            "truncated": len(matched) > 10,
        },
    )
