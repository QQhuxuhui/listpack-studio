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

from .a_plus import (
    APlusBuilderExecutor,
    APlusModuleType,
    ComparisonModule,
    ComparisonRow,
    FeatureGridItem,
    FeatureGridModule,
    HeroModule,
    RenderedModule,
    StandardImageTextModule,
    TextAreaTooLarge,
)
from .banner import (
    BackgroundImageLayer,
    BannerExecutor,
    CalloutLayer,
    Canvas,
    CompositionSpec,
    FontSpec,
    LayerType,
    Position,
    ProductLayer,
    RenderedBanner,
    Size,
    TextLayer,
    VectorShapeLayer,
)
from .c2pa_stamper import (
    DISCLOSURE_LABEL,
    C2PAStamper,
    StampResult,
    is_ai_disclosed,
    read_disclosure,
)
from .cache import ImageCache, InMemoryImageCache
from .image_executor import GeneratedImage, ImageExecutor
from .platform_adapter import (
    SLOT_CATALOG,
    AdaptedImage,
    PlatformAdapter,
    PlatformSlot,
    SlotRecipe,
)

__all__ = [
    "APlusBuilderExecutor",
    "APlusModuleType",
    "AdaptedImage",
    "BackgroundImageLayer",
    "BannerExecutor",
    "C2PAStamper",
    "CalloutLayer",
    "Canvas",
    "ComparisonModule",
    "ComparisonRow",
    "CompositionSpec",
    "DISCLOSURE_LABEL",
    "FeatureGridItem",
    "FeatureGridModule",
    "FontSpec",
    "GeneratedImage",
    "HeroModule",
    "ImageCache",
    "ImageExecutor",
    "InMemoryImageCache",
    "LayerType",
    "PlatformAdapter",
    "PlatformSlot",
    "Position",
    "ProductLayer",
    "RenderedBanner",
    "RenderedModule",
    "SLOT_CATALOG",
    "Size",
    "SlotRecipe",
    "StampResult",
    "StandardImageTextModule",
    "TextAreaTooLarge",
    "TextLayer",
    "VectorShapeLayer",
    "is_ai_disclosed",
    "read_disclosure",
]
