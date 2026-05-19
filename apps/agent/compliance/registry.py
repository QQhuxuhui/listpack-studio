"""Detector / fixer registries.

Detectors register by `detector_type` name (matches `RuleSpec.detector_type`).
Engine looks up the detector callable at evaluation time.

Why a registry instead of import-and-call: lets rules in DB reference detectors
by string (so a non-engineer can author rules) and isolates the engine from
detector implementation details.
"""

from __future__ import annotations

from typing import Callable, Dict

from .schemas import DetectorContext, DetectorResult

DetectorFn = Callable[[DetectorContext, dict], DetectorResult]
FixerFn = Callable[[bytes, dict], bytes]

detector_registry: Dict[str, DetectorFn] = {}
fixer_registry: Dict[str, FixerFn] = {}


def register_detector(detector_type: str) -> Callable[[DetectorFn], DetectorFn]:
    """Decorator. Use on top-level functions in compliance.detectors.*."""

    def decorate(fn: DetectorFn) -> DetectorFn:
        if detector_type in detector_registry:
            raise ValueError(f"detector already registered: {detector_type}")
        detector_registry[detector_type] = fn
        return fn

    return decorate


def register_fixer(fixer_type: str) -> Callable[[FixerFn], FixerFn]:
    def decorate(fn: FixerFn) -> FixerFn:
        if fixer_type in fixer_registry:
            raise ValueError(f"fixer already registered: {fixer_type}")
        fixer_registry[fixer_type] = fn
        return fn

    return decorate


def _autoload() -> None:
    """Import all detectors/fixers so their @register decorators run."""
    # Detectors
    from .detectors import (  # noqa: F401
        background_color,
        border_detection,
        color_space,
        file_format,
        file_size,
        halo_edge,
        pixel_dimension,
        product_fill_ratio,
        shadow_intensity,
    )


_autoload()
