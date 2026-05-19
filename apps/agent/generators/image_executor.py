"""ImageExecutor — SceneSpec → image bytes via Router + Cache.

Flow:
  spec, params  →  PromptCompiler.compile()  →  prompt string
                                ↓
  cache_key = hash(model_id, prompt, dims, seed)
                                ↓
  cache hit? → return cached.bytes  (skips model call)
  miss?      → router.image_gen()   → cache.put → return

Why bytes + not URLs:
  model providers expire signed URLs; we own the artefact for the lifetime
  of the ListingPack. Cache stores bytes too, R2 will be byte-keyed.

Why prompt is part of the cache key:
  same SceneSpec might compile to two different prompts as PromptCompiler
  evolves (e.g. new vocabulary version). Hashing the prompt — not the spec —
  guarantees only true equivalences hit the cache.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal

from models.base import ImageGenRequest
from models.cost import CostBudget
from models.router import ModelRouter
from scene_spec import PromptCompiler, SceneSpec

from .cache import CachedImage, ImageCache, InMemoryImageCache, compute_cache_key

logger = logging.getLogger("listpack.generators.image_executor")


@dataclass
class GeneratedImage:
    bytes_data: bytes
    mime: str
    prompt: str
    model_id: str
    cost_usd: Decimal
    cache_hit: bool
    cache_key: str


class ImageExecutor:
    """Stateful holder of router + cache + compiler.

    Constructed once per process (typically at app startup, alongside the
    router). Safe to share across requests — no per-call state.
    """

    def __init__(
        self,
        *,
        router: ModelRouter,
        cache: ImageCache | None = None,
        compiler: PromptCompiler | None = None,
    ) -> None:
        self._router = router
        self._cache = cache or InMemoryImageCache()
        self._compiler = compiler or PromptCompiler()

    async def generate(
        self,
        spec: SceneSpec,
        *,
        budget: CostBudget,
        width: int = 1024,
        height: int = 1024,
        seed: int | None = None,
        model_hint: str | None = None,
        prefer_n: int = 1,
    ) -> GeneratedImage:
        """Generate one image from `spec`. May be served from cache."""
        prompt = self._compiler.compile(spec)
        # Resolve the model id NOW so the cache key encodes which model we
        # *would* call; otherwise a hint change wouldn't bust the cache.
        resolved_model = self._resolved_model_id(model_hint)
        cache_key = compute_cache_key(
            resolved_model, prompt, width, height, seed, prefer_n
        )

        # Cache lookup
        cached = await self._cache.get(cache_key)
        if cached is not None:
            logger.debug(
                "image cache HIT key=%s model=%s", cache_key, cached.model_id
            )
            return GeneratedImage(
                bytes_data=cached.bytes_data,
                mime=cached.mime,
                prompt=prompt,
                model_id=cached.model_id,
                cost_usd=Decimal(cached.cost_usd),
                cache_hit=True,
                cache_key=cache_key,
            )

        # Cache miss → call model
        req = ImageGenRequest(
            model="(router-chooses)",
            prompt=prompt,
            width=width,
            height=height,
            n=prefer_n,
            extra={"seed": seed} if seed is not None else None,
        )
        resp = await self._router.image_gen(req, budget=budget, model_hint=model_hint)
        if not resp.images:
            from models.exceptions import ModelInvalidResponse

            raise ModelInvalidResponse(
                "image_gen returned no images", model=resp.usage.model
            )

        bytes_out = resp.images[0]
        cost = resp.usage.cost_usd

        await self._cache.put(
            cache_key,
            CachedImage(
                bytes_data=bytes_out,
                mime=resp.mime,
                model_id=resp.usage.model,
                cost_usd=str(cost),
                cache_key=cache_key,
            ),
        )
        logger.debug(
            "image cache MISS key=%s model=%s cost=%s",
            cache_key,
            resp.usage.model,
            cost,
        )
        return GeneratedImage(
            bytes_data=bytes_out,
            mime=resp.mime,
            prompt=prompt,
            model_id=resp.usage.model,
            cost_usd=cost,
            cache_hit=False,
            cache_key=cache_key,
        )

    # ── private ────────────────────────────────────────────────

    def _resolved_model_id(self, hint: str | None) -> str:
        """Resolve which model the router WOULD pick.

        Walks the router's selection order without actually invoking
        anything. Used to encode the model id into the cache key.
        """
        # Router exposes _selection_order; cheap private call, kept private
        # so we can later wrap it in a public method without breaking callers.
        order = self._router._selection_order(  # noqa: SLF001
            task="image_gen", model_hint=hint
        )
        return order[0].id
