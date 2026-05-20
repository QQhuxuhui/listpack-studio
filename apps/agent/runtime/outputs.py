"""Persist agent run outputs (stamped images) into Postgres + storage.

Called by listing_pack_runner once a run completes successfully. Writes:
    assets   (type='output', storage_key, mime, file_size, hash)
    outputs  (listing_pack_id, asset_id, platform, slot, metadata)

The `outputs` table is workspace-scoped via listing_pack_id → workspace_id.
The web side's GET /api/runs/{id} joins outputs back to runs for the
detail UI.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from .persistence import _new_id, _postgres_url
from .storage import build_asset_key, put_bytes

logger = logging.getLogger("listpack.runtime.outputs")


@dataclass(frozen=True)
class PersistedOutput:
    output_id: str
    asset_id: str
    platform: str
    slot: str
    storage_key: str
    public_url: str


def _resolve_workspace_for_pack(pack_id: str) -> str | None:
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT workspace_id FROM listing_packs WHERE id = %s",
                (pack_id,),
            )
            row = cur.fetchone()
    return str(row[0]) if row else None


def persist_outputs(
    *,
    listing_pack_id: str,
    final_state: dict[str, Any],
) -> list[PersistedOutput]:
    """Persist every stamped image (or platform output) on `final_state`.

    Expected shapes (produced by graphs/listing_pack):
      stamped_images: [
        {"slot": "amazon.main",  "bytes": b"...", "mime": "image/png",
         "platform": "amazon", "metadata": {...}}
      ]

    If the runner replaced bytes with a placeholder for JSONB persistence,
    that entry is skipped (logged once) — bytes only live in memory.
    """
    images = final_state.get("stamped_images") or final_state.get(
        "platform_outputs"
    ) or []
    if not images:
        return []

    workspace_id = _resolve_workspace_for_pack(listing_pack_id)
    if not workspace_id:
        logger.warning(
            "persist_outputs: listing_pack %s missing workspace; skip",
            listing_pack_id,
        )
        return []

    persisted: list[PersistedOutput] = []
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor() as cur:
            for entry in images:
                data: bytes | None = entry.get("bytes")
                if not isinstance(data, (bytes, bytearray)):
                    # Already replaced with a {_kind: bytes_placeholder} dict,
                    # or never present — nothing to persist.
                    continue
                mime: str = entry.get("mime") or "image/png"
                slot: str = entry.get("slot") or "scene"
                platform: str = entry.get("platform") or slot.split(".", 1)[0]

                asset_id = _new_id()
                key = build_asset_key(workspace_id, asset_id, mime)
                put = put_bytes(key=key, data=bytes(data), mime=mime)

                cur.execute(
                    """
                    INSERT INTO assets
                      (id, workspace_id, type, storage_key, mime,
                       file_size, hash, category)
                    VALUES
                      (%s, %s, 'output', %s, %s, %s, %s, %s)
                    """,
                    (
                        asset_id,
                        workspace_id,
                        put.storage_key,
                        mime,
                        put.size,
                        put.sha256,
                        entry.get("category"),
                    ),
                )

                output_id = _new_id()
                meta = {
                    k: v
                    for k, v in entry.items()
                    if k not in ("bytes", "mime", "slot", "platform")
                }
                cur.execute(
                    """
                    INSERT INTO outputs
                      (id, listing_pack_id, asset_id, platform, slot, metadata)
                    VALUES
                      (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        output_id,
                        listing_pack_id,
                        asset_id,
                        platform,
                        slot,
                        Jsonb(meta) if meta else None,
                    ),
                )

                persisted.append(
                    PersistedOutput(
                        output_id=output_id,
                        asset_id=asset_id,
                        platform=platform,
                        slot=slot,
                        storage_key=put.storage_key,
                        public_url=f"/api/assets/by-key/{put.storage_key}/raw",
                    )
                )

    return persisted
