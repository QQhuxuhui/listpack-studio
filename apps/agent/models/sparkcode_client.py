"""OpenAI-compatible client for the sparkcode proxy API.

The user runs their own sparkcode middleware that proxies to upstream
providers (Anthropic, OpenAI, etc.) with one OpenAI-style endpoint. So we
hit `/v1/chat/completions` + `/v1/images/generations` + `/v1/images/edits`
and let sparkcode route to the actual model.

Env vars:
- SPARKCODE_API_BASE  (default https://api.sparkcode.top/v1)
- SPARKCODE_API_KEY   (no default — required at first call)

This client is deliberately small: no retries, no fallback, no budgeting.
The Router layer does all of that.
"""

from __future__ import annotations

import base64
import logging
import os
from decimal import Decimal
from typing import Any

import httpx

from .base import (
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
from .catalog import cost_for
from .exceptions import (
    ModelInvalidResponse,
    ModelRefused,
    ModelUnavailable,
)

logger = logging.getLogger("listpack.models.sparkcode")


class SparkcodeClient:
    """One client instance per process, shared across requests.

    Holds a single httpx.AsyncClient with connection pooling. Reused for
    all models that route through sparkcode.
    """

    name = "sparkcode"

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = (
            base_url
            or os.environ.get("SPARKCODE_API_BASE", "https://api.sparkcode.top/v1")
        ).rstrip("/")
        self._api_key = api_key or os.environ.get("SPARKCODE_API_KEY", "")
        self._client = client  # lazy-init on first call

    # ── lifecycle ────────────────────────────────────────────────

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is not None:
            return self._client
        if not self._api_key:
            raise ModelUnavailable(
                "SPARKCODE_API_KEY not set; sparkcode client cannot run",
                model="(sparkcode)",
            )
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # ── helpers ──────────────────────────────────────────────────

    @staticmethod
    def _classify(exc: Exception, *, model: str) -> ModelUnavailable | ModelRefused:
        """Map httpx errors to model-layer errors."""
        if isinstance(exc, httpx.HTTPStatusError):
            status = exc.response.status_code
            if status in (400, 422):
                # Provider typically returns 400 for content-policy refusals.
                # We can't always tell content-refusal from validation; lean
                # on the response body for the hint.
                try:
                    body = exc.response.json()
                except Exception:
                    body = {}
                msg = str(body.get("error", {}).get("message", exc))
                if "policy" in msg.lower() or "refus" in msg.lower():
                    return ModelRefused(msg, model=model)
                return ModelUnavailable(f"{status}: {msg}", model=model)
            return ModelUnavailable(f"{status}: {exc}", model=model)
        return ModelUnavailable(str(exc), model=model)

    @staticmethod
    def _usage_from_chat(model: str, body: dict) -> Usage:
        u = body.get("usage", {}) or {}
        return Usage(
            model=model,
            prompt_tokens=u.get("prompt_tokens"),
            completion_tokens=u.get("completion_tokens"),
            cost_usd=cost_for(model),
        )

    # ── chat ─────────────────────────────────────────────────────

    async def chat(self, req: ChatRequest) -> ChatResponse:
        client = await self._get_client()
        payload: dict[str, Any] = {
            "model": req.model,
            "messages": [{"role": m.role, "content": m.content} for m in req.messages],
        }
        if req.max_tokens:
            payload["max_tokens"] = req.max_tokens
        if req.temperature is not None:
            payload["temperature"] = req.temperature
        if req.json_schema:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "output", "schema": req.json_schema, "strict": True},
            }

        try:
            r = await client.post(
                "/chat/completions",
                json=payload,
                timeout=req.timeout_seconds,
            )
            r.raise_for_status()
            body = r.json()
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            raise self._classify(exc, model=req.model) from exc

        try:
            text = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ModelInvalidResponse(
                f"unexpected chat completion shape: {body}", model=req.model
            ) from exc

        json_data: dict | None = None
        if req.json_schema:
            import json as _json
            try:
                json_data = _json.loads(text)
            except _json.JSONDecodeError as exc:
                raise ModelInvalidResponse(
                    f"model returned non-JSON despite json_schema: {text[:200]!r}",
                    model=req.model,
                ) from exc

        return ChatResponse(
            text=text,
            usage=self._usage_from_chat(req.model, body),
            json_data=json_data,
        )

    # ── vision ───────────────────────────────────────────────────

    async def vision(self, req: VisionRequest) -> VisionResponse:
        client = await self._get_client()
        data_url = (
            f"data:{req.image_mime};base64,"
            + base64.b64encode(req.image_bytes).decode("ascii")
        )
        payload = {
            "model": req.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": req.prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
        }
        if req.max_tokens:
            payload["max_tokens"] = req.max_tokens

        try:
            r = await client.post(
                "/chat/completions",
                json=payload,
                timeout=req.timeout_seconds,
            )
            r.raise_for_status()
            body = r.json()
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            raise self._classify(exc, model=req.model) from exc

        try:
            text = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ModelInvalidResponse(
                f"unexpected vision completion shape: {body}", model=req.model
            ) from exc

        return VisionResponse(text=text, usage=self._usage_from_chat(req.model, body))

    # ── image generation ────────────────────────────────────────

    async def image_gen(self, req: ImageGenRequest) -> ImageGenResponse:
        client = await self._get_client()
        payload: dict[str, Any] = {
            "model": req.model,
            "prompt": req.prompt,
            "n": req.n,
            "size": f"{req.width}x{req.height}",
            "response_format": "b64_json",
        }
        if req.extra:
            payload.update(req.extra)

        try:
            r = await client.post(
                "/images/generations",
                json=payload,
                timeout=req.timeout_seconds,
            )
            r.raise_for_status()
            body = r.json()
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            raise self._classify(exc, model=req.model) from exc

        try:
            entries = body["data"]
            images = [base64.b64decode(e["b64_json"]) for e in entries]
        except (KeyError, TypeError, ValueError) as exc:
            raise ModelInvalidResponse(
                f"unexpected image generation shape: {body}", model=req.model
            ) from exc

        return ImageGenResponse(
            images=images,
            mime="image/png",  # OpenAI-compatible image API returns PNG
            usage=Usage(
                model=req.model,
                cost_usd=cost_for(req.model) * Decimal(req.n),
            ),
        )

    # ── image edit ──────────────────────────────────────────────

    async def image_edit(self, req: ImageEditRequest) -> ImageEditResponse:
        client = await self._get_client()
        # OpenAI-compatible image edit uses multipart/form-data
        files: dict[str, Any] = {
            "image": (
                "input.png",
                req.image_bytes,
                req.image_mime or "image/png",
            ),
        }
        if req.mask_bytes:
            files["mask"] = ("mask.png", req.mask_bytes, "image/png")

        data: dict[str, Any] = {
            "model": req.model,
            "prompt": req.prompt,
            "response_format": "b64_json",
        }
        if req.width and req.height:
            data["size"] = f"{req.width}x{req.height}"
        if req.extra:
            data.update(req.extra)

        try:
            # NB: send Authorization header explicitly because the multipart
            # request overrides the client default Content-Type.
            r = await client.post(
                "/images/edits",
                files=files,
                data=data,
                timeout=req.timeout_seconds,
                headers={"Authorization": f"Bearer {self._api_key}"},
            )
            r.raise_for_status()
            body = r.json()
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            raise self._classify(exc, model=req.model) from exc

        try:
            entry = body["data"][0]
            image_bytes = base64.b64decode(entry["b64_json"])
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise ModelInvalidResponse(
                f"unexpected image edit shape: {body}", model=req.model
            ) from exc

        return ImageEditResponse(
            image_bytes=image_bytes,
            mime="image/png",
            usage=Usage(model=req.model, cost_usd=cost_for(req.model)),
        )
