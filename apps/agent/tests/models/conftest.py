"""Test fixtures for the models layer.

`mock_client` simulates a provider so we can exercise Router behaviour
(selection, budget, fallback chain) without hitting sparkcode HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

import pytest

from models.base import (
    ChatRequest,
    ChatResponse,
    ImageEditRequest,
    ImageEditResponse,
    ImageGenRequest,
    ImageGenResponse,
    Usage,
    VisionRequest,
    VisionResponse,
)
from models.exceptions import ModelRefused, ModelUnavailable


@dataclass
class MockModelClient:
    """Programmable ModelClient stand-in.

    `fail_for_models` is a set of model ids that should raise on call.
    `refused_models` raises ModelRefused (no retry / no fallback).
    `call_log` records every (method, model) pair the router asked for.
    """

    name: str = "sparkcode"
    fail_for_models: set[str] = field(default_factory=set)
    refused_models: set[str] = field(default_factory=set)
    invalid_response_models: set[str] = field(default_factory=set)
    call_log: list[tuple[str, str]] = field(default_factory=list)
    # Override the cost the mock returns; default uses catalog estimate.
    cost_override: dict[str, Decimal] | None = None

    def _maybe_fail(self, model: str) -> None:
        if model in self.refused_models:
            raise ModelRefused(f"mock refused {model}", model=model)
        if model in self.fail_for_models:
            raise ModelUnavailable(f"mock down: {model}", model=model)

    def _cost(self, model: str) -> Decimal:
        if self.cost_override and model in self.cost_override:
            return self.cost_override[model]
        from models.catalog import cost_for

        return cost_for(model)

    async def chat(self, req: ChatRequest) -> ChatResponse:
        self.call_log.append(("chat", req.model))
        self._maybe_fail(req.model)
        return ChatResponse(
            text=f"[mock-{req.model}] " + req.messages[-1].content,
            usage=Usage(model=req.model, cost_usd=self._cost(req.model)),
        )

    async def vision(self, req: VisionRequest) -> VisionResponse:
        self.call_log.append(("vision", req.model))
        self._maybe_fail(req.model)
        return VisionResponse(
            text=f"[mock-{req.model}] saw image, prompt={req.prompt!r}",
            usage=Usage(model=req.model, cost_usd=self._cost(req.model)),
        )

    async def image_gen(self, req: ImageGenRequest) -> ImageGenResponse:
        self.call_log.append(("image_gen", req.model))
        self._maybe_fail(req.model)
        return ImageGenResponse(
            images=[b"fake-png-bytes" for _ in range(req.n)],
            mime="image/png",
            usage=Usage(
                model=req.model,
                cost_usd=self._cost(req.model) * Decimal(req.n),
            ),
        )

    async def image_edit(self, req: ImageEditRequest) -> ImageEditResponse:
        self.call_log.append(("image_edit", req.model))
        self._maybe_fail(req.model)
        return ImageEditResponse(
            image_bytes=b"fake-edited-png",
            mime="image/png",
            usage=Usage(model=req.model, cost_usd=self._cost(req.model)),
        )


@pytest.fixture
def mock_client() -> MockModelClient:
    return MockModelClient()
