"""Request / response shapes and ModelClient Protocol.

One typed method per task kind keeps each client small and testable
(see SparkcodeClient). Routing decisions stay in the Router; clients are
dumb transports that don't know about catalogs or budgets.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Protocol, runtime_checkable

TaskKind = Literal["chat", "vision", "image_gen", "image_edit"]


# ─── chat ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ChatMessage:
    role: Literal["system", "user", "assistant"]
    content: str


@dataclass
class ChatRequest:
    model: str
    messages: list[ChatMessage]
    max_tokens: int | None = None
    temperature: float | None = None
    # When set, the LLM is asked to emit JSON conforming to the schema.
    # Implementations should use the provider's structured-output / tool-use
    # facility (OpenAI `response_format`, Claude tool use, Gemini schema).
    json_schema: dict | None = None
    timeout_seconds: float = 60.0


# ─── vision (image-in, text-out) ───────────────────────────────────


@dataclass
class VisionRequest:
    model: str
    prompt: str
    image_bytes: bytes
    image_mime: str = "image/jpeg"
    max_tokens: int | None = None
    timeout_seconds: float = 60.0


# ─── image generation (text → image) ───────────────────────────────


@dataclass
class ImageGenRequest:
    model: str
    prompt: str
    width: int = 1024
    height: int = 1024
    n: int = 1
    # Provider-specific knobs (steps, guidance, seed) go through `extra`
    # so we don't have to redesign Request for each new model.
    extra: dict | None = None
    timeout_seconds: float = 120.0


# ─── image edit (image + text → image) ─────────────────────────────


@dataclass
class ImageEditRequest:
    model: str
    prompt: str
    image_bytes: bytes
    image_mime: str = "image/jpeg"
    mask_bytes: bytes | None = None  # for inpaint targets
    width: int | None = None  # default: keep source size
    height: int | None = None
    extra: dict | None = None
    timeout_seconds: float = 120.0


# ─── responses ─────────────────────────────────────────────────────


@dataclass
class Usage:
    """Per-call token / cost accounting.

    `cost_usd` is the *charged* cost (from provider metadata when available,
    otherwise our catalog estimate). Used by CostBudget.
    """

    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    cost_usd: Decimal = Decimal("0")
    latency_ms: int | None = None


@dataclass
class ChatResponse:
    text: str
    usage: Usage
    # Raw parsed JSON if the caller asked for structured output.
    json_data: dict | None = None


@dataclass
class VisionResponse:
    text: str
    usage: Usage


@dataclass
class ImageGenResponse:
    """N images returned as raw bytes + the mime/format the client encoded as.

    Always bytes — not URLs — so the caller (R2 uploader / cache / inpaint)
    has the canonical artefact and isn't racing the model provider's CDN TTL.
    """

    images: list[bytes]
    mime: str
    usage: Usage


@dataclass
class ImageEditResponse:
    image_bytes: bytes
    mime: str
    usage: Usage


# ─── client protocol ───────────────────────────────────────────────


@runtime_checkable
class ModelClient(Protocol):
    """Implementations live in models/<provider>_client.py.

    Tests use MockModelClient (defined in tests/models/conftest.py) which
    satisfies this protocol without going over HTTP.
    """

    name: str

    async def chat(self, req: ChatRequest) -> ChatResponse: ...

    async def vision(self, req: VisionRequest) -> VisionResponse: ...

    async def image_gen(self, req: ImageGenRequest) -> ImageGenResponse: ...

    async def image_edit(self, req: ImageEditRequest) -> ImageEditResponse: ...
