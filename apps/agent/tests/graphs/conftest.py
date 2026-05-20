"""Shared fixtures for graph tests.

`mocked_services` wires the minimum stubs every listing_pack node touches —
mock router, in-memory cache, simple stubs for the executors.
"""

from __future__ import annotations

import io
import json
from decimal import Decimal

import pytest
from PIL import Image

from compliance.schemas import RuleSeverity, RuleSpec
from generators import (
    APlusBuilderExecutor,
    BannerExecutor,
    C2PAStamper,
    ImageExecutor,
    InMemoryImageCache,
    PlatformAdapter,
)
from graphs.listing_pack.nodes import Services
from models import CostBudget, ModelRouter
from models.base import (
    ChatRequest,
    ChatResponse,
    ImageGenRequest,
    ImageGenResponse,
    Usage,
)
from scene_spec import SceneJsonExecutor
from tests.models.conftest import MockModelClient


def _real_png_bytes(width: int = 256, height: int = 256, color=(120, 120, 120)) -> bytes:
    """A genuine PNG the platform adapter and Pillow can parse."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


VALID_SPEC = {
    "scene_spec_version": "1.0",
    "background": {
        "type": "solid",
        "value": "#FFFFFF",
        "lighting": "soft_diffused",
        "mood": "minimal",
    },
    "color_palette": ["#FFFFFF", "#888888"],
    "aspect_ratio": "1:1",
    "product": {
        "asset_ref": "asset_test",
        "preserve_fidelity": True,
        "position": "center",
        "scale": 0.85,
        "rotation": 0,
    },
    "elements": [],
    "text_overlays": [],
    "constraints": {
        "no_text_in_image": True,
        "max_text_area_pct": 1.0,
        "background_must_be_white": True,
        "no_person": True,
        "no_props": True,
    },
}


class CannedSceneClient(MockModelClient):
    """Chat returns VALID_SPEC; image_gen returns real PNG bytes Pillow can read."""

    async def chat(self, req: ChatRequest) -> ChatResponse:
        self.call_log.append(("chat", req.model))
        if req.model in self.fail_for_models:
            from models.exceptions import ModelUnavailable

            raise ModelUnavailable("mock down", model=req.model)
        text = json.dumps(VALID_SPEC)
        return ChatResponse(
            text=text,
            json_data=VALID_SPEC,
            usage=Usage(model=req.model, cost_usd=Decimal("0.02")),
        )

    async def image_gen(self, req: ImageGenRequest) -> ImageGenResponse:
        self.call_log.append(("image_gen", req.model))
        if req.model in self.fail_for_models:
            from models.exceptions import ModelUnavailable

            raise ModelUnavailable("mock down", model=req.model)
        # Generate `n` distinct-coloured PNGs so downstream Pillow operations
        # have valid bytes to consume.
        images = [
            _real_png_bytes(req.width, req.height, color=(100 + i * 30, 120, 200 - i * 20))
            for i in range(req.n)
        ]
        return ImageGenResponse(
            images=images,
            mime="image/png",
            usage=Usage(model=req.model, cost_usd=Decimal("0.039") * Decimal(req.n)),
        )


def _white_jpeg(width: int = 1500, height: int = 1500) -> tuple[bytes, str]:
    """A clean source image that mostly passes compliance."""
    img = Image.new("RGB", (width, height), (255, 255, 255))
    from PIL import ImageDraw

    d = ImageDraw.Draw(img)
    margin = int(min(width, height) * 0.08)
    d.rectangle(
        [margin, margin, width - margin, height - margin],
        fill=(100, 100, 100),
    )
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue(), "image/jpeg"


def _no_op_rules_loader(_platform: str, _category: str | None = None) -> list[RuleSpec]:
    """Return zero rules so compliance_check passes trivially."""
    return []


@pytest.fixture
def fixture_jpeg() -> tuple[bytes, str]:
    return _white_jpeg()


@pytest.fixture
def mock_canned_client() -> CannedSceneClient:
    return CannedSceneClient()


@pytest.fixture
def mocked_services(mock_canned_client: CannedSceneClient) -> Services:
    """Production-shaped Services with mocks in place of HTTP calls."""
    router = ModelRouter(clients={"sparkcode": mock_canned_client})
    scene_exec = SceneJsonExecutor(router)
    image_exec = ImageExecutor(router=router, cache=InMemoryImageCache())
    return Services(
        router=router,
        scene_executor=scene_exec,
        image_executor=image_exec,
        platform_adapter=PlatformAdapter(),
        c2pa_stamper=C2PAStamper(),
        a_plus_builder=APlusBuilderExecutor(),
        banner_executor=BannerExecutor(),
        rules_loader=_no_op_rules_loader,
    )


@pytest.fixture
def budget_one_dollar() -> CostBudget:
    return CostBudget(cap_usd=Decimal("1"))
