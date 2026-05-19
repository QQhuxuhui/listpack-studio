"""Image generators — turn structured specs into actual images.

Each generator wraps:
- a ModelRouter call (or pipeline of calls)
- a deterministic cache lookup so repeat requests are free
- platform-specific post-processing

D15 ships ImageExecutor (scene_spec → image bytes).
D16 adds APlusBuilderExecutor (modules → Amazon A+ Content long image).
D17 adds BannerExecutor (composition_spec → layered PNG/SVG/PSD).
D18 adds PlatformAdapter (multi-size) + C2PA stamping.
"""

from .cache import ImageCache, InMemoryImageCache
from .image_executor import GeneratedImage, ImageExecutor

__all__ = [
    "GeneratedImage",
    "ImageCache",
    "ImageExecutor",
    "InMemoryImageCache",
]
