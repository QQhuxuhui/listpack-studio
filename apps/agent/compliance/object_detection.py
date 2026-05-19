"""DETR (facebook/detr-resnet-50) singleton for object detection.

Used by:
- person_in_image  (Amazon main-image no-models/no-props rule)
- object_count     (catch multiple products in one frame, props, packaging)

Why DETR not YOLOv8:
YOLOv8 is AGPL-3.0 — the AGPL "network use" clause is triggered by SaaS
deployments. DETR (Apache 2.0) is license-clean.

Why facebook/detr-resnet-50:
- Apache 2.0
- 91-class COCO (covers person, products, packaging, animals, scale items)
- ~160MB weights, ~2-4s CPU inference per image
- HuggingFace transformers handles loading + preprocessing
"""

from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass
from typing import Any

from PIL import Image

logger = logging.getLogger("listpack.compliance.object_detection")

_model_singleton: Any = None
_processor_singleton: Any = None

MODEL_ID = os.environ.get("OBJECT_DETECT_MODEL", "facebook/detr-resnet-50")
MODEL_REVISION = os.environ.get("OBJECT_DETECT_REVISION", "no_timm")


@dataclass
class ObjectBox:
    label: str  # COCO class name (e.g. "person", "bottle", "cup")
    confidence: float
    bbox: list[int]  # [x1, y1, x2, y2] in pixel coords


def _init_model() -> tuple[Any, Any]:
    """Lazy-init DETR model + processor. First call downloads ~160MB weights."""
    global _model_singleton, _processor_singleton
    if _model_singleton is not None and _processor_singleton is not None:
        return _model_singleton, _processor_singleton

    # Imports deferred so detectors that don't run object detection
    # (e.g. file_size) don't pay the torch import cost.
    import torch  # noqa: F401  — needed to register backend
    from transformers import AutoImageProcessor, DetrForObjectDetection

    _processor_singleton = AutoImageProcessor.from_pretrained(
        MODEL_ID, revision=MODEL_REVISION
    )
    _model_singleton = DetrForObjectDetection.from_pretrained(
        MODEL_ID, revision=MODEL_REVISION
    )
    _model_singleton.eval()
    logger.info("DETR initialised (model=%s)", MODEL_ID)
    return _model_singleton, _processor_singleton


def detect_objects(
    image_bytes: bytes, min_confidence: float = 0.7
) -> list[ObjectBox]:
    """Detect objects in `image_bytes` with confidence ≥ threshold.

    Returns empty list (and logs) on any error — same defensive pattern as
    OCR — so transient torch/transformers issues don't fail the engine.
    """
    try:
        model, processor = _init_model()
    except Exception as exc:
        logger.exception("DETR failed to initialise: %s", exc)
        return []

    try:
        import torch

        with Image.open(io.BytesIO(image_bytes)) as img:
            if img.mode != "RGB":
                if img.mode == "RGBA":
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    bg.paste(img, mask=img.split()[-1])
                    img = bg
                else:
                    img = img.convert("RGB")
            pil_img = img.copy()  # decouple from bytes file handle

        inputs = processor(images=pil_img, return_tensors="pt")
        with torch.no_grad():
            outputs = model(**inputs)

        # (H, W) — note tensor wants (height, width)
        target_sizes = torch.tensor([[pil_img.height, pil_img.width]])
        results = processor.post_process_object_detection(
            outputs, target_sizes=target_sizes, threshold=min_confidence
        )[0]
    except Exception as exc:
        logger.exception("DETR inference failed: %s", exc)
        return []

    id2label = model.config.id2label
    out: list[ObjectBox] = []
    for score, label, box in zip(
        results["scores"], results["labels"], results["boxes"]
    ):
        name = id2label.get(int(label), f"id_{int(label)}")
        out.append(
            ObjectBox(
                label=str(name),
                confidence=float(score),
                bbox=[int(c) for c in box.tolist()],
            )
        )
    return out
