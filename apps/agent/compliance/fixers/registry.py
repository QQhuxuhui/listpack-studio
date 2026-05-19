"""Fixer registry — mirrors `compliance/registry.py` for detectors.

Each fixer registers by `auto_fix.type` string from RuleSpec. Coordinator
looks up the fixer at apply time, passes (image_bytes, spec) and gets
back the fixed bytes.
"""

from __future__ import annotations

from typing import Any, Callable, Dict

# Fixer signature: (image_bytes, mime, spec) → (fixed_bytes, fixed_mime, metadata)
FixerFn = Callable[
    [bytes, str, dict],
    "FixerResult",
]


class FixerResult:
    """Container returned by every fixer.

    `bytes_out`/`mime_out` are the resulting image. `metadata` is whatever
    diagnostic the fixer wants to surface (was the change material? new
    dimensions? bytes saved?). Coordinator persists this into UsageRecord.
    """

    def __init__(
        self,
        bytes_out: bytes,
        mime_out: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.bytes_out = bytes_out
        self.mime_out = mime_out
        self.metadata = metadata or {}


fixer_registry: Dict[str, FixerFn] = {}


def register_fixer(fix_type: str) -> Callable[[FixerFn], FixerFn]:
    """Decorator. Use on top-level functions in compliance.fixers.*."""

    def decorate(fn: FixerFn) -> FixerFn:
        if fix_type in fixer_registry:
            raise ValueError(f"fixer already registered: {fix_type}")
        fixer_registry[fix_type] = fn
        return fn

    return decorate


def _autoload() -> None:
    """Import each fixer module so its @register_fixer decorator runs."""
    from . import (  # noqa: F401
        compress,
        convert_color_space,
        convert_format,
        crop_to_fill_ratio,
        resize,
        smooth_halo_edges,
        whiten_background,
    )


_autoload()
