"""Pydantic schemas for `scene_spec` — the canonical intermediate.

Shape:
  global: { background, color_palette, aspect_ratio }
  product: { asset_ref, preserve_fidelity, position, scale, rotation }
  elements: [decorative props/people/animals/objects]
  text_overlays: [text that should be rendered LATER by libvips, not by diffusion]
  constraints: { hard rules from the active platform_rules set }

JSON conforms to a JSON Schema we hand to the LLM via response_format —
so the LLM literally cannot return malformed data on success.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ─── enums ─────────────────────────────────────────────────────────


class BackgroundType(str, Enum):
    solid = "solid"
    gradient = "gradient"
    scene = "scene"  # AI-generated scene like "outdoor_summer_garden"


class Lighting(str, Enum):
    soft_diffused = "soft_diffused"
    hard_studio = "hard_studio"
    natural_window = "natural_window"
    golden_hour = "golden_hour"
    cool_overcast = "cool_overcast"


class Mood(str, Enum):
    warm = "warm"
    minimal = "minimal"
    luxurious = "luxurious"
    playful = "playful"
    technical = "technical"
    seasonal_summer = "seasonal_summer"
    seasonal_winter = "seasonal_winter"


class AspectRatio(str, Enum):
    square = "1:1"
    portrait_4_5 = "4:5"
    portrait_3_4 = "3:4"
    landscape_16_9 = "16:9"
    landscape_3_2 = "3:2"


ElementPosition = Literal[
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
    "around_product",
]

ProductPositionPreset = Literal[
    "center",
    "lower-third",
    "upper-third",
    "left-third",
    "right-third",
]


# ─── nested models ─────────────────────────────────────────────────


class Background(BaseModel):
    type: BackgroundType
    # solid: hex like "#FFE5E5"
    # gradient: "warm-sunset", "cool-mint" etc. (compiled into stops)
    # scene: a scene id or free-text description e.g. "outdoor_summer_garden"
    value: str = Field(min_length=1)
    lighting: Lighting | None = None
    mood: Mood | None = None


class ProductPositionXY(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    x: float = Field(ge=0, le=1, description="0=left edge, 1=right edge")
    y: float = Field(ge=0, le=1, description="0=top edge, 1=bottom edge")


class Product(BaseModel):
    asset_ref: str  # uuid of source asset in `assets` table
    preserve_fidelity: bool = True
    # Either a preset or explicit normalised coords
    position: ProductPositionPreset | ProductPositionXY = "center"
    scale: float = Field(default=0.85, ge=0.1, le=1.0,
                         description="fraction of frame's shorter side the product fills")
    rotation: float = Field(default=0, ge=-180, le=180)


class Element(BaseModel):
    type: Literal["decoration", "natural", "vector_shape"]
    description: str
    position: ElementPosition = "around_product"
    density: Literal["sparse", "moderate", "dense"] | None = None


class TextOverlay(BaseModel):
    """Text rendered by libvips / Skia AFTER diffusion, not BY diffusion.

    Diffusion models still struggle with text; rendering in-code guarantees
    the caption is exactly what the user typed (correct spelling, glyph,
    legibility) at the cost of a less "artistic" look. For artistic text
    (3D / handwritten / decorative) use an Element with `type: 'decoration'`
    and put the text in `description`.
    """

    content: str = Field(min_length=1, max_length=500)
    position: ProductPositionXY
    font_family: str = "Inter"
    font_size_pct: float = Field(default=0.06, ge=0.01, le=0.5,
                                  description="fraction of shorter side")
    color: str = "#000000"  # hex
    weight: Literal["regular", "bold", "extra-bold"] = "bold"


class Constraints(BaseModel):
    """Hard rules sourced from active platform_rules — fed in by caller,
    used by the LLM as system context AND by PromptCompiler to assert."""

    no_text_in_image: bool = False
    max_text_area_pct: float = 1.0
    background_must_be_white: bool = False
    no_person: bool = False
    no_props: bool = False


# ─── root ──────────────────────────────────────────────────────────


class SceneSpec(BaseModel):
    """Canonical intermediate between user intent + LLM and image generator."""

    model_config = ConfigDict(populate_by_name=True)

    scene_spec_version: Literal["1.0"] = "1.0"
    background: Background
    color_palette: list[str] = Field(default_factory=list,
                                      description="hex colours")
    aspect_ratio: AspectRatio = AspectRatio.square

    product: Product
    elements: list[Element] = Field(default_factory=list)
    text_overlays: list[TextOverlay] = Field(default_factory=list)

    constraints: Constraints = Field(default_factory=Constraints)


# ─── helpers ───────────────────────────────────────────────────────


def scene_spec_json_schema() -> dict:
    """Returns the JSON schema for LLM `response_format`."""
    return SceneSpec.model_json_schema()
