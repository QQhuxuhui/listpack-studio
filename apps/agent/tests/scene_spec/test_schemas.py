"""D13 SceneSpec schema tests — Pydantic validation rules."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from scene_spec import (
    AspectRatio,
    Background,
    BackgroundType,
    Constraints,
    Element,
    Lighting,
    Mood,
    Product,
    SceneSpec,
    TextOverlay,
)
from scene_spec.schemas import ProductPositionXY, scene_spec_json_schema


def _minimal_spec(**overrides) -> SceneSpec:
    defaults = dict(
        background=Background(type=BackgroundType.solid, value="#FFFFFF"),
        product=Product(asset_ref="asset_test"),
    )
    defaults.update(overrides)
    return SceneSpec(**defaults)


def test_minimal_spec_round_trips():
    spec = _minimal_spec()
    j = spec.model_dump_json()
    again = SceneSpec.model_validate_json(j)
    assert again.product.asset_ref == "asset_test"
    assert again.scene_spec_version == "1.0"


def test_product_position_xy_constraints():
    """x and y must be in [0, 1]."""
    with pytest.raises(ValidationError):
        Product(asset_ref="x", position=ProductPositionXY(x=1.2, y=0.5))


def test_aspect_ratio_enum():
    spec = _minimal_spec(aspect_ratio=AspectRatio.portrait_4_5)
    assert spec.aspect_ratio.value == "4:5"


def test_text_overlay_required_fields():
    """content + position both required; defaults fill the rest."""
    t = TextOverlay(content="SALE 50% OFF",
                    position=ProductPositionXY(x=0.5, y=0.85))
    assert t.font_family == "Inter"
    assert 0 < t.font_size_pct < 1


def test_elements_can_be_empty():
    spec = _minimal_spec()
    assert spec.elements == []


def test_elements_accept_position_keyword():
    el = Element(type="decoration", description="rose petals", position="around_product")
    assert el.position == "around_product"


def test_constraints_default_to_permissive():
    spec = _minimal_spec()
    assert spec.constraints.no_text_in_image is False
    assert spec.constraints.no_person is False


def test_amazon_compliant_spec_validates():
    spec = _minimal_spec(
        background=Background(
            type=BackgroundType.solid,
            value="#FFFFFF",
            lighting=Lighting.hard_studio,
            mood=Mood.minimal,
        ),
        product=Product(asset_ref="asset_x", scale=0.87),
        constraints=Constraints(
            no_text_in_image=True,
            background_must_be_white=True,
            no_person=True,
            no_props=True,
        ),
    )
    assert spec.constraints.background_must_be_white is True


def test_schema_export_is_json_serialisable():
    """JSON schema we hand the LLM must be plain JSON."""
    import json as _json

    schema = scene_spec_json_schema()
    _json.dumps(schema)  # must not raise
    assert "$defs" in schema or "definitions" in schema or "properties" in schema
