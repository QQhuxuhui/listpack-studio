"""Auto-fix actions invoked when a detector flags a violation.

Pairs with `compliance/detectors/` — each fixer accepts a rule's `auto_fix`
spec plus the failing image bytes and returns the fixed bytes (best effort).

v1 ships pure-Pillow fixers that work offline:
- resize / compress / convert_format / convert_color_space
- whiten_background (white_threshold mode)
- crop_to_fill_ratio
- smooth_halo_edges

Inpainting-based fixers (remove_text, remove_watermark) need an external
inpaint model (LaMa / Flux Fill) and land in D12.5 — until then they
register as `not_implemented` placeholders that surface a clear error.
"""

from .registry import fixer_registry, register_fixer

__all__ = ["fixer_registry", "register_fixer"]
