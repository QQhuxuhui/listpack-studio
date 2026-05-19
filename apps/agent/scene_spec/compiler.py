"""PromptCompiler — turn a SceneSpec into a prompt string for image_gen.

Strategy:
- Each layer of the spec maps to a clause; clauses are joined with commas.
- Constraints become NEGATIVE prompt directives ("--no text", "--no person")
  even though OpenAI-compatible image APIs don't have a separate negative
  prompt field — we encode them as English negations the model will follow.
- TextOverlays are NOT included in the prompt; they're rendered later in
  code (see PRD § 02 § 4.4 — diffusion can't reliably render exact text).
- For Banner / artistic-text use cases, the caller adds an Element with
  type='decoration' and the text in description.

Output is one string. Callers that need finer control (e.g. ControlNet
pose maps, region masks) compose extra inputs around this string.
"""

from __future__ import annotations

from .schemas import (
    Background,
    BackgroundType,
    Constraints,
    Element,
    Product,
    ProductPositionPreset,
    ProductPositionXY,
    SceneSpec,
)


class PromptCompiler:
    """Stateless. Holds defaults like positional vocabulary so a future
    locale-aware compiler can swap the words without breaking callers."""

    POSITION_WORDS: dict[str, str] = {
        "center": "centered",
        "lower-third": "in the lower third of the frame",
        "upper-third": "in the upper third of the frame",
        "left-third": "shifted to the left",
        "right-third": "shifted to the right",
        "top-left": "in the top-left",
        "top-center": "at the top center",
        "top-right": "in the top-right",
        "center-left": "centered on the left",
        "center-right": "centered on the right",
        "bottom-left": "in the bottom-left",
        "bottom-center": "at the bottom center",
        "bottom-right": "in the bottom-right",
        "around_product": "scattered around the product",
    }

    def compile(self, spec: SceneSpec) -> str:
        parts: list[str] = []

        # Subject (always first — diffusion models weight the lead heavily)
        parts.append(self._product_clause(spec.product))

        # Background / scene
        parts.append(self._background_clause(spec.background))

        # Palette hint
        if spec.color_palette:
            parts.append(
                f"colour palette {', '.join(spec.color_palette)}"
            )

        # Decorative elements
        for el in spec.elements:
            parts.append(self._element_clause(el))

        # Quality / camera hints (universal)
        parts.append("professional studio product photography")
        parts.append("sharp focus, high detail")

        # Aspect ratio hint (some models honour it, others need explicit
        # width/height params — we encode here for the ones that do)
        parts.append(f"{spec.aspect_ratio.value} aspect ratio")

        # Constraints as negative directives
        neg = self._constraint_clauses(spec.constraints)
        parts.extend(neg)

        return ", ".join(parts)

    # ── per-section helpers ────────────────────────────────────────

    def _product_clause(self, product: Product) -> str:
        pos = product.position
        if isinstance(pos, ProductPositionXY):
            pos_phrase = f"positioned at ({pos.x:.2f}, {pos.y:.2f})"
        else:
            pos_phrase = self.POSITION_WORDS.get(pos, str(pos))

        fidelity = (
            "exactly as in the reference, preserving every label, colour, "
            "texture, and proportion"
            if product.preserve_fidelity
            else "in a similar style"
        )
        scale_phrase = (
            f"taking up {int(product.scale * 100)}% of the frame"
            if product.scale != 0.85
            else "as the dominant subject"
        )
        return f"the product {fidelity}, {pos_phrase}, {scale_phrase}"

    def _background_clause(self, bg: Background) -> str:
        if bg.type is BackgroundType.solid:
            base = f"solid {bg.value} background"
        elif bg.type is BackgroundType.gradient:
            base = f"{bg.value} gradient background"
        else:  # scene
            base = f"{bg.value} background"
        if bg.lighting:
            base += f", {bg.lighting.value.replace('_', ' ')} lighting"
        if bg.mood:
            base += f", {bg.mood.value.replace('_', ' ').replace('seasonal ', '')} mood"
        return base

    def _element_clause(self, el: Element) -> str:
        pos = self.POSITION_WORDS.get(el.position, str(el.position))
        density = f"{el.density} " if el.density else ""
        return f"{density}{el.description} {pos}"

    def _constraint_clauses(self, c: Constraints) -> list[str]:
        out: list[str] = []
        if c.no_text_in_image:
            out.append("no text, no captions, no logos, no watermarks anywhere")
        if c.background_must_be_white:
            out.append(
                "background must be pure white (RGB 255,255,255), absolutely solid"
            )
        if c.no_person:
            out.append("no people, no hands, no body parts")
        if c.no_props:
            out.append("no additional props or accessories, only the product itself")
        return out

    # ── alt-format helpers ─────────────────────────────────────────

    def compile_with_constraints_block(self, spec: SceneSpec) -> str:
        """Variant that pulls constraints into a separate '--negative' block.

        Useful for clients that pass a separate negative prompt field
        (Replicate flux models, some self-hosted setups). The default
        `compile()` already encodes constraints inline.
        """
        base = self.compile(spec)
        neg = self._constraint_clauses(spec.constraints)
        if not neg:
            return base
        return f"{base}\n--negative {', '.join(neg)}"
