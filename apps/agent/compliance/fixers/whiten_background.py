"""whiten_background fixer.

Three modes:
- 'white_threshold' (offline, default): treat any pixel within
  bg_tolerance of pure white as background and force it to (255,255,255).
  Good enough for studio shots that are 'almost white' (#f8f8f8 → #fff)
  and unblocks Amazon's strict `background_white` rule without any model.

- 'ai_remove_bg' (D55, self-hosted): run `rembg` (Apache 2.0,
  ONNX-runtime) against the requested model — default `u2net`, or
  `isnet-general-use` (briaai's preferred) when `model` spec is set.
  Returns a hard-white-background composite. ONNX runs CPU-only in our
  Docker image; first call downloads ~50 MB to ~/.u2net/. We swallow
  ImportError → graceful fallback to white_threshold so the fixer is
  still useful when the optional dep isn't installed.

- 'replicate_remove_bg' (cloud): call Replicate's hosted RMBG-2.0 when
  REPLICATE_API_TOKEN is set. We keep this branch for environments that
  can't ship ONNX (Vercel edge / serverless cold start). Returns an
  explicit not-implemented error when the token is missing.

Spec:
- method (str, optional, default 'white_threshold')
- bg_tolerance (int, optional, default 15) — white_threshold only
- model (str, optional, default 'u2net') — ai_remove_bg only;
  see https://github.com/danielgatis/rembg for the full list
"""

from __future__ import annotations

import io
import logging
import os

import numpy as np
from PIL import Image

from .registry import FixerResult, register_fixer

logger = logging.getLogger("listpack.compliance.fixers.whiten_background")


def _white_threshold(image_bytes: bytes, tolerance: int) -> tuple[bytes, dict]:
    with Image.open(io.BytesIO(image_bytes)) as img:
        # Flatten any alpha onto white first so the threshold makes sense.
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            rgb = bg
        else:
            rgb = img.convert("RGB")
        arr = np.array(rgb)

    # Per-channel deviation from white
    dist = np.max(255 - arr.astype(np.int16), axis=2)
    mask = dist <= tolerance  # True = near-white → snap to pure white

    arr[mask] = 255
    changed_px = int(mask.sum())
    total_px = int(arr.shape[0] * arr.shape[1])

    out = Image.fromarray(arr.astype(np.uint8), mode="RGB")
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=92, optimize=True)
    return (
        buf.getvalue(),
        {
            "method": "white_threshold",
            "tolerance": tolerance,
            "pixels_snapped_to_white": changed_px,
            "snap_rate": round(changed_px / total_px, 4),
        },
    )


@register_fixer("whiten_background")
def whiten_background(image_bytes: bytes, mime: str, spec: dict) -> FixerResult:
    method = spec.get("method", "white_threshold")

    if method == "white_threshold":
        tolerance = int(spec.get("bg_tolerance", 15))
        out_bytes, metadata = _white_threshold(image_bytes, tolerance)
        return FixerResult(out_bytes, "image/jpeg", metadata)

    if method == "ai_remove_bg":
        model_name = str(spec.get("model", "u2net"))
        try:
            from rembg import new_session, remove  # type: ignore[import-not-found]
        except ImportError:
            logger.warning(
                "rembg not installed; falling back to white_threshold for whiten_background"
            )
            tolerance = int(spec.get("bg_tolerance", 15))
            out_bytes, metadata = _white_threshold(image_bytes, tolerance)
            metadata["requested_method"] = "ai_remove_bg"
            metadata["fallback_reason"] = "rembg not installed"
            return FixerResult(out_bytes, "image/jpeg", metadata)

        try:
            session = new_session(model_name)
            cutout = remove(image_bytes, session=session)
            # `cutout` is an RGBA PNG with the subject preserved and
            # background made transparent. Composite onto pure white so
            # Amazon's background_white rule passes.
            with Image.open(io.BytesIO(cutout)) as fg:
                fg = fg.convert("RGBA")
                white_bg = Image.new("RGB", fg.size, (255, 255, 255))
                white_bg.paste(fg, mask=fg.split()[-1])
                buf = io.BytesIO()
                white_bg.save(buf, format="JPEG", quality=92, optimize=True)
                return FixerResult(
                    buf.getvalue(),
                    "image/jpeg",
                    {
                        "method": "ai_remove_bg",
                        "model": model_name,
                        "subject_pixels": int(np.array(fg)[:, :, 3].astype(bool).sum()),
                    },
                )
        except Exception as exc:  # noqa: BLE001 — never crash, always degrade
            logger.exception("rembg call failed; falling back to white_threshold")
            tolerance = int(spec.get("bg_tolerance", 15))
            out_bytes, metadata = _white_threshold(image_bytes, tolerance)
            metadata["requested_method"] = "ai_remove_bg"
            metadata["fallback_reason"] = f"rembg error: {exc}"
            return FixerResult(out_bytes, "image/jpeg", metadata)

    if method == "replicate_remove_bg":
        if not os.environ.get("REPLICATE_API_TOKEN"):
            return FixerResult(
                image_bytes,
                mime,
                {
                    "method": "replicate_remove_bg",
                    "applied": False,
                    "error": "REPLICATE_API_TOKEN not configured",
                    "hint": "set REPLICATE_API_TOKEN to use the cloud RMBG-2.0 model",
                },
            )
        # Hosted Replicate call left as a v2 follow-up — `ai_remove_bg`
        # (self-hosted rembg) is the default recommendation.
        return FixerResult(
            image_bytes,
            mime,
            {
                "method": "replicate_remove_bg",
                "applied": False,
                "error": "Replicate adapter pending — use method='ai_remove_bg'",
            },
        )

    raise ValueError(f"unsupported whiten_background method: {method!r}")
