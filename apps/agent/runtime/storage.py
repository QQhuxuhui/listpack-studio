"""LocalFS storage backend for the agent service.

Mirrors apps/web/lib/storage/local-fs.ts so both services can read/write
under the same STORAGE_ROOT. Production swaps in an S3 backend; D35
shipped the web-side abstraction first, this file lands the Python
counterpart so the agent can persist `outputs.*` bytes after a run.

Layout (must match the web side):
    {STORAGE_ROOT}/workspaces/{ws_id}/assets/{asset_id}.{ext}
    {STORAGE_ROOT}/workspaces/{ws_id}/assets/{asset_id}.{ext}.mime

The `.mime` sidecar lets `/api/assets/by-key/.../raw` return the right
Content-Type when the browser fetches the output.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PutResult:
    storage_key: str
    sha256: str
    size: int


def storage_root() -> Path:
    root = os.environ.get("STORAGE_ROOT", "storage")
    return Path(root).resolve()


def _resolve_key(key: str) -> Path:
    root = storage_root()
    full = (root / key).resolve()
    # Path-traversal guard: full must live under root.
    try:
        full.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"storage key escapes root: {key}") from exc
    return full


def ext_for(mime: str) -> str:
    return {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/tiff": "tif",
        "image/gif": "gif",
        "image/heic": "heic",
    }.get(mime, "bin")


def put_bytes(*, key: str, data: bytes, mime: str) -> PutResult:
    full = _resolve_key(key)
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_bytes(data)
    full.with_suffix(full.suffix + ".mime").write_text(mime, encoding="utf-8")
    return PutResult(
        storage_key=key,
        sha256=hashlib.sha256(data).hexdigest(),
        size=len(data),
    )


def build_asset_key(workspace_id: str, asset_id: str, mime: str) -> str:
    return f"workspaces/{workspace_id}/assets/{asset_id}.{ext_for(mime)}"


def public_url(storage_key: str) -> str:
    """Same-origin URL the web app's /api/assets/by-key/.../raw serves."""
    from urllib.parse import quote

    return f"/api/assets/by-key/{quote(storage_key, safe='')}/raw"
