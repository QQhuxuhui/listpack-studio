"""Image cache for generator outputs.

A cache hit means we skip a model call entirely — saves model budget + latency.
For a SaaS, the bytes live in R2 with a hash-keyed object name; here we ship
an in-memory implementation good for tests + local dev, plus a Protocol so
production can swap in R2 / Cloudflare Cache API without touching ImageExecutor.

Cache key strategy (`compute_cache_key`):
- hash the model id + canonical JSON of (spec, params, seed)
- canonical = sorted keys, no whitespace → identical specs hash identically
- SHA-256 truncated to first 32 chars (still ~10^-30 collision prob; readable)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable


def compute_cache_key(*parts: Any) -> str:
    """Stable hash over any JSON-serialisable sequence."""
    canonical = json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


@dataclass
class CachedImage:
    bytes_data: bytes
    mime: str
    model_id: str
    cost_usd: str  # Decimal stringified so JSON round-trips
    cache_key: str


@runtime_checkable
class ImageCache(Protocol):
    """Async interface so R2 / network caches plug in directly."""

    async def get(self, key: str) -> CachedImage | None: ...

    async def put(self, key: str, value: CachedImage) -> None: ...


class InMemoryImageCache:
    """Bounded, thread-safe in-process cache.

    Use the default 256-entry cap so a hot loop doesn't grow unbounded.
    For long-running workers swap to an R2-backed implementation.
    """

    def __init__(self, max_entries: int = 256) -> None:
        self._max = max_entries
        self._data: dict[str, CachedImage] = {}
        self._lock = asyncio.Lock()
        self.hits = 0
        self.misses = 0

    async def get(self, key: str) -> CachedImage | None:
        async with self._lock:
            value = self._data.get(key)
            if value is not None:
                self.hits += 1
            else:
                self.misses += 1
            return value

    async def put(self, key: str, value: CachedImage) -> None:
        async with self._lock:
            # FIFO eviction — good enough; LRU is over-engineering at this scale
            if len(self._data) >= self._max and key not in self._data:
                self._data.pop(next(iter(self._data)))
            self._data[key] = value

    async def clear(self) -> None:
        async with self._lock:
            self._data.clear()
            self.hits = 0
            self.misses = 0

    def stats(self) -> dict[str, int]:
        return {"hits": self.hits, "misses": self.misses, "size": len(self._data)}
