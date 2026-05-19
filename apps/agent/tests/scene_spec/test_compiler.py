"""D14 PromptCompiler tests."""

from __future__ import annotations

import pytest

from scene_spec import (
    AspectRatio,
    Background,
    BackgroundType,
    Constraints,
    Element,
    Lighting,
    Mood,
    Product,
    PromptCompiler,
    SceneSpec,
)
from scene_spec.schemas import ProductPositionXY


@pytest.fixture
def compiler() -> PromptCompiler:
    return PromptCompiler()


def _spec(**kw):
    base = dict(
        background=Background(type=BackgroundType.solid, value="#FFFFFF"),
        product=Product(asset_ref="asset_x"),
    )
    base.update(kw)
    return SceneSpec(**base)


# ─── product clause ───────────────────────────────────────────────


def test_product_appears_first(compiler):
    """Diffusion models weight the first phrase heavily — product MUST lead."""
    spec = _spec()
    prompt = compiler.compile(spec)
    assert prompt.startswith("the product")


def test_preserve_fidelity_phrases_explicit(compiler):
    spec = _spec(product=Product(asset_ref="x", preserve_fidelity=True))
    prompt = compiler.compile(spec)
    assert "exactly as in the reference" in prompt
    assert "every label" in prompt  # the fidelity emphasis phrase


def test_explicit_xy_position(compiler):
    spec = _spec(
        product=Product(
            asset_ref="x",
            position=ProductPositionXY(x=0.5, y=0.65),
        )
    )
    prompt = compiler.compile(spec)
    assert "positioned at (0.50, 0.65)" in prompt


# ─── background ───────────────────────────────────────────────────


def test_solid_background(compiler):
    spec = _spec(background=Background(type=BackgroundType.solid, value="#FFFFFF"))
    prompt = compiler.compile(spec)
    assert "solid #FFFFFF background" in prompt


def test_scene_background_with_lighting_and_mood(compiler):
    spec = _spec(
        background=Background(
            type=BackgroundType.scene,
            value="summer beach golden hour",
            lighting=Lighting.golden_hour,
            mood=Mood.warm,
        )
    )
    prompt = compiler.compile(spec)
    assert "summer beach golden hour background" in prompt
    assert "golden hour lighting" in prompt
    assert "warm mood" in prompt


# ─── constraints → negatives ──────────────────────────────────────


def test_constraints_appear_as_negatives(compiler):
    spec = _spec(
        constraints=Constraints(
            no_text_in_image=True,
            no_person=True,
            no_props=True,
            background_must_be_white=True,
        )
    )
    prompt = compiler.compile(spec)
    assert "no text" in prompt
    assert "no people" in prompt
    assert "no additional props" in prompt
    assert "pure white" in prompt


def test_no_constraints_means_no_negatives(compiler):
    spec = _spec(constraints=Constraints())
    prompt = compiler.compile(spec)
    assert "no text" not in prompt
    assert "no people" not in prompt


# ─── elements + palette ───────────────────────────────────────────


def test_elements_render_with_position_and_density(compiler):
    spec = _spec(
        elements=[
            Element(
                type="decoration",
                description="scattered rose petals",
                position="around_product",
                density="moderate",
            )
        ]
    )
    prompt = compiler.compile(spec)
    assert "moderate scattered rose petals scattered around the product" in prompt


def test_color_palette_renders(compiler):
    spec = _spec(color_palette=["#F5C2C7", "#FFFFFF", "#D4AF37"])
    prompt = compiler.compile(spec)
    assert "colour palette #F5C2C7, #FFFFFF, #D4AF37" in prompt


# ─── alt-format ───────────────────────────────────────────────────


def test_compile_with_constraints_block_returns_negative_section(compiler):
    spec = _spec(
        constraints=Constraints(no_text_in_image=True, no_person=True),
    )
    out = compiler.compile_with_constraints_block(spec)
    assert "--negative" in out
    assert out.count("no text") >= 1  # mentioned inline + in negative block


def test_compile_with_constraints_block_no_negative_when_unconstrained(compiler):
    spec = _spec(constraints=Constraints())
    out = compiler.compile_with_constraints_block(spec)
    assert "--negative" not in out


# ─── aspect ratio ─────────────────────────────────────────────────


def test_aspect_ratio_emitted(compiler):
    spec = _spec(aspect_ratio=AspectRatio.portrait_4_5)
    prompt = compiler.compile(spec)
    assert "4:5 aspect ratio" in prompt
