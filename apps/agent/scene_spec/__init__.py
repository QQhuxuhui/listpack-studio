"""Scene-spec layer — structured intermediate between user intent and image model.

PRD § 02 § 4 (Omost-inspired): rather than throwing a natural-language prompt
at a diffusion model and hoping, we ask an LLM to first emit a structured
`scene_spec` JSON (background mood, palette, product placement, text overlays,
constraints). Then PromptCompiler renders the spec to a model-ready prompt.

Benefits:
- Controllable (商品位置 / 文字区域 100% 精准, PRD § 02 § 4.5)
- Cacheable (same spec hash → same image, skip the model call)
- Editable (用户在 UI 改 spec, 不需要重写自然语言 prompt)
- Reproducible (same spec + seed → same image)
- Multi-language (LLM writes spec in any language, render layer is language-neutral)

Public API:
- `SceneSpec`, `Element`, `TextOverlay`, etc. (Pydantic models)
- `SceneJsonExecutor` (calls LLM, returns SceneSpec)
- `PromptCompiler` (SceneSpec → str prompt for image_gen)
"""

from .compiler import PromptCompiler
from .executor import SceneJsonExecutor
from .schemas import (
    AspectRatio,
    Background,
    BackgroundType,
    Constraints,
    Element,
    ElementPosition,
    Lighting,
    Mood,
    Product,
    SceneSpec,
    TextOverlay,
)

__all__ = [
    "AspectRatio",
    "Background",
    "BackgroundType",
    "Constraints",
    "Element",
    "ElementPosition",
    "Lighting",
    "Mood",
    "Product",
    "PromptCompiler",
    "SceneJsonExecutor",
    "SceneSpec",
    "TextOverlay",
]
