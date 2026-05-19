"""text_in_image detector.

Amazon main images forbid ANY text, logo overlay, watermark, or promo banner.
We run OCR and flag if any high-confidence text is detected.

Spec keys:
- `allowed` (bool, required): if false, ANY detected text → fail.
- `min_confidence` (float, optional, default 0.7): OCR confidence threshold
  to count a hit. PaddleOCR sometimes hallucinates spurious "text" from busy
  textures (e.g. fabric weave); 0.7+ filters most of those out.
- `min_text_length` (int, optional, default 2): ignore single-character hits
  (often noise).
"""

from __future__ import annotations

from ..ocr import extract_text
from ..registry import register_detector
from ..schemas import DetectorContext, DetectorResult


@register_detector("text_in_image")
def text_in_image(ctx: DetectorContext, spec: dict) -> DetectorResult:
    allowed = spec.get("allowed")
    if allowed is None:
        return DetectorResult(
            passed=False,
            evidence={"error": "spec.allowed must be set (true|false)"},
        )

    min_conf = float(spec.get("min_confidence", 0.7))
    min_len = int(spec.get("min_text_length", 2))

    hits = extract_text(ctx.image_bytes, min_confidence=min_conf)
    significant = [h for h in hits if len(h.text.strip()) >= min_len]

    has_text = len(significant) > 0
    # `allowed=true`  → passes if has_text or not
    # `allowed=false` → passes only if NOT has_text
    passed = bool(allowed) or not has_text

    return DetectorResult(
        passed=passed,
        evidence={
            "allowed": allowed,
            "min_confidence": min_conf,
            "min_text_length": min_len,
            "detected_text_count": len(significant),
            "detected_text": [
                {"text": h.text, "confidence": round(h.confidence, 3)}
                for h in significant[:10]  # cap evidence at 10 hits
            ],
            "truncated": len(significant) > 10,
        },
    )
