"""PaddleOCR singleton + shared text-extraction helper.

PaddleOCR is heavy:
- ~280MB Python wheel
- ~20MB model files downloaded on first run
- 2-4s warmup per fresh instance

We initialise once per process and share across all OCR-based detectors
(text_in_image, category_forbidden_text, etc.) so the model load amortises.

Why `lang='ch'`:
The Chinese model bundles both Chinese and English recognition. Cross-border
sellers ship images with either or both, so 'ch' is the highest-coverage default.
A future `OCR_LANG` env var can pin to 'en' / 'japan' / 'korean' for speed.
"""

from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image

logger = logging.getLogger("listpack.compliance.ocr")

_ocr_singleton: Any = None  # paddleocr.PaddleOCR instance, lazy-loaded


@dataclass
class TextBox:
    """One OCR hit: text string, confidence, bbox in pixel coords."""

    text: str
    confidence: float
    bbox: list[list[int]]  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] clockwise from TL


def _get_ocr() -> Any:
    """Lazy-init PaddleOCR. First call is slow (model download + warmup)."""
    global _ocr_singleton
    if _ocr_singleton is not None:
        return _ocr_singleton

    # Import inside the function so other detectors (and tests that mock OCR)
    # don't pay the import cost just by loading the compliance package.
    from paddleocr import PaddleOCR  # type: ignore[import-untyped]

    lang = os.environ.get("OCR_LANG", "ch")
    _ocr_singleton = PaddleOCR(
        use_angle_cls=True,
        lang=lang,
        show_log=False,
    )
    logger.info("PaddleOCR initialised (lang=%s)", lang)
    return _ocr_singleton


def extract_text(image_bytes: bytes, min_confidence: float = 0.5) -> list[TextBox]:
    """Run OCR on `image_bytes`. Returns text hits with confidence ≥ threshold.

    Returns an empty list if PaddleOCR finds no text. Always returns — does
    not raise on OCR errors (logs and returns empty), so a transient model
    issue can't bring down the compliance engine.
    """
    try:
        ocr = _get_ocr()
    except Exception as exc:
        logger.exception("PaddleOCR failed to initialise: %s", exc)
        return []

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            if img.mode != "RGB":
                if img.mode == "RGBA":
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    bg.paste(img, mask=img.split()[-1])
                    img = bg
                else:
                    img = img.convert("RGB")
            arr = np.array(img)

        # PaddleOCR 2.x: ocr.ocr(img_array, cls=True)
        # Returns [[ [box, (text, score)], ... ]] (outer wraps per-image)
        raw = ocr.ocr(arr, cls=True)
    except Exception as exc:
        logger.exception("PaddleOCR inference failed: %s", exc)
        return []

    if not raw or raw[0] is None:
        return []

    out: list[TextBox] = []
    for entry in raw[0]:
        try:
            box, (text, score) = entry
        except (TypeError, ValueError):
            continue
        if float(score) < min_confidence:
            continue
        out.append(
            TextBox(
                text=str(text),
                confidence=float(score),
                bbox=[[int(p[0]), int(p[1])] for p in box],
            )
        )
    return out
