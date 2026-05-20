"""Critic — VLM-backed image evaluator + Painter-Commenter refinement loop.

PRD § 02 § 3.2 (Paper2Poster-inspired):
  Painter (image_gen) generates → Commenter (this Critic) scores via VLM →
  if score < accept_threshold, send improvement_directions back into the
  prompt + regenerate, up to `max_iterations`. Damping prevents the loop
  oscillating between two extreme suggestions.

Critic input:
  - image bytes  (the candidate)
  - critic_card  (which dimensions to score on)
  - scene_spec   (so the critic knows the original intent)

Critic output:
  - overall_score (0-10, weighted by card.dimensions)
  - dimension_scores (per dimension with reasoning)
  - improvement_directions (free-text suggestions for the next iteration)
  - decision: 'accept' / 'refine' / 'abort'

`abort` is for unrecoverable cases — e.g. the critic detects regulated
content (medical claims overlay) that no amount of refinement will fix.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from models.base import VisionRequest
from models.cost import CostBudget
from models.exceptions import ModelInvalidResponse
from models.router import ModelRouter

logger = logging.getLogger("listpack.graphs.listing_pack.critic")


# ─── data models ─────────────────────────────────────────────────


class CriticDimension(BaseModel):
    """One scoring axis on a CriticCard."""

    name: str = Field(min_length=1, max_length=80)
    weight: float = Field(gt=0, le=1.0)
    description: str = Field(min_length=1, max_length=300)


class CriticCard(BaseModel):
    """A reusable evaluation rubric the Critic instantiates per call.

    Pre-shipped cards live in `BUILTIN_CRITIC_CARDS`; users can author
    custom cards (v2 — they'd land in `critic_cards` PG table).
    """

    card_id: str = Field(min_length=1, max_length=64)
    version: int = Field(default=1, ge=1)
    scope: list[str] = Field(default_factory=list)  # e.g. ['scene_image']
    dimensions: list[CriticDimension] = Field(min_length=1, max_length=8)
    accept_threshold: float = Field(default=7.5, ge=0, le=10)
    abort_score_below: float = Field(default=2.0, ge=0, le=10)


class DimensionScore(BaseModel):
    name: str
    score: float = Field(ge=0, le=10)
    reasoning: str = Field(max_length=400)


class CriticResult(BaseModel):
    overall_score: float = Field(ge=0, le=10)
    dimension_scores: list[DimensionScore]
    improvement_directions: list[str] = Field(default_factory=list, max_length=8)
    decision: Literal["accept", "refine", "abort"]


# ─── built-in cards ──────────────────────────────────────────────


BUILTIN_CRITIC_CARDS: dict[str, CriticCard] = {
    "ecom_aesthetic_v1": CriticCard(
        card_id="ecom_aesthetic_v1",
        version=1,
        scope=["scene_image"],
        dimensions=[
            CriticDimension(
                name="product_fidelity",
                weight=0.35,
                description="商品形状/颜色/纹理是否与参考图一致, 是否失真",
            ),
            CriticDimension(
                name="lighting_quality",
                weight=0.20,
                description="光照自然度, 阴影合理性, 是否过曝/欠曝",
            ),
            CriticDimension(
                name="composition",
                weight=0.20,
                description="构图 (三分法 / 留白 / 主体突出)",
            ),
            CriticDimension(
                name="scene_relevance",
                weight=0.15,
                description="场景与商品语义匹配度",
            ),
            CriticDimension(
                name="ecommerce_appeal",
                weight=0.10,
                description="电商场景下的购买吸引力 + 不含违规元素",
            ),
        ],
        accept_threshold=7.5,
        abort_score_below=2.0,
    ),
    "product_fidelity_v1": CriticCard(
        card_id="product_fidelity_v1",
        version=1,
        scope=["scene_image", "a_plus"],
        dimensions=[
            CriticDimension(
                name="shape_preservation",
                weight=0.45,
                description="商品轮廓 / 比例与原图一致",
            ),
            CriticDimension(
                name="color_preservation",
                weight=0.30,
                description="主体颜色 / 渐变与原图一致, 不偏色",
            ),
            CriticDimension(
                name="label_text_preservation",
                weight=0.25,
                description="商品标签 / 包装文字未变形 / 拼写正确",
            ),
        ],
        accept_threshold=8.0,
        abort_score_below=3.0,
    ),
    "amazon_compliance_v1": CriticCard(
        card_id="amazon_compliance_v1",
        version=1,
        scope=["main_image"],
        dimensions=[
            CriticDimension(
                name="background_white",
                weight=0.35,
                description="背景是否纯白 (RGB 255,255,255) 无杂色",
            ),
            CriticDimension(
                name="product_fill_85pct",
                weight=0.25,
                description="商品占长边 ≥ 85%",
            ),
            CriticDimension(
                name="no_text_or_logo",
                weight=0.20,
                description="无任何文字 / Logo / 水印 / 促销条幅",
            ),
            CriticDimension(
                name="no_props_or_models",
                weight=0.20,
                description="无人物 / 模特 / 手 / 道具 / 包装盒",
            ),
        ],
        accept_threshold=8.0,
        abort_score_below=2.0,
    ),
}


# ─── critic agent ────────────────────────────────────────────────


_SYSTEM_PROMPT = """\
You are ListPack's image quality critic. Score the candidate image
against the provided rubric (CriticCard). For each dimension:
- give a 0-10 score (10 = perfect, 0 = unusable)
- give a one-sentence `reasoning`

Then output `improvement_directions`: 1-4 specific, actionable
suggestions the next generation pass can try. Be specific
("increase background brightness", not "make it nicer").

Decision rules:
- accept   if overall_score >= card.accept_threshold
- abort    if any dimension's score < card.abort_score_below OR
           if you detect an unrecoverable issue (regulated content,
           wrong product type, NSFW)
- refine   otherwise

Output STRICT JSON matching the provided schema. No commentary.
"""


@dataclass
class _CriticOutcome:
    result: CriticResult
    cost_usd: Decimal


class Critic:
    """Wraps a Router VLM call."""

    def __init__(
        self,
        router: ModelRouter,
        *,
        model_hint: str | None = None,
    ) -> None:
        self._router = router
        self._model_hint = model_hint

    async def evaluate(
        self,
        image_bytes: bytes,
        *,
        image_mime: str,
        card: CriticCard,
        scene_spec_dump: dict | None,
        budget: CostBudget,
    ) -> _CriticOutcome:
        """Score `image_bytes` against `card`. Returns parsed CriticResult + cost."""
        user_msg = json.dumps(
            {
                "card": card.model_dump(),
                "scene_spec": scene_spec_dump or {},
            },
            ensure_ascii=False,
        )

        req = VisionRequest(
            model="(router-chooses)",
            prompt=f"{_SYSTEM_PROMPT}\n\n{user_msg}",
            image_bytes=image_bytes,
            image_mime=image_mime,
            max_tokens=800,
        )

        spent_before = budget.spent_usd
        resp = await self._router.vision(
            req, budget=budget, model_hint=self._model_hint
        )

        # Vision endpoints don't usually honour `response_format` so we parse text.
        text = resp.text.strip()
        # Strip occasional code fences
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.lstrip().lower().startswith("json"):
                text = text.split("\n", 1)[1] if "\n" in text else text
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ModelInvalidResponse(
                f"critic returned non-JSON: {text[:200]!r}",
                model=resp.usage.model,
            ) from exc

        # Some models return wrapper; tolerate
        if "result" in data and "overall_score" not in data:
            data = data["result"]

        result = CriticResult.model_validate(data)
        return _CriticOutcome(
            result=result,
            cost_usd=budget.spent_usd - spent_before,
        )


# ─── damping (Painter-Commenter loop param update) ──────────────


def damp(current: float, target: float, *, damping: float = 0.4) -> float:
    """Smooth a parameter change toward a target to stop the loop oscillating.

    PRD § 02 § 3.3 / Paper2Poster: without damping, two extreme critic
    directions ping-pong the parameter between extremes forever. Damping
    of 0.3-0.5 was their sweet spot.

        new = current + damping * (target - current)
    """
    if not (0 < damping < 1):
        raise ValueError(f"damping must be in (0, 1); got {damping}")
    return current + damping * (target - current)
