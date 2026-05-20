"""Brand-kit lookup for the listing_pack runner.

D46: agent fetches the workspace's brand_kit row (if any) and injects it
into the listing_pack state so scene_json can use it for palette / font /
tagline guidance.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import psycopg
from psycopg.rows import dict_row

logger = logging.getLogger("listpack.runtime.brand_kit")


def _postgres_url() -> str:
    url = os.environ.get("POSTGRES_URL")
    if not url:
        raise RuntimeError("POSTGRES_URL not set; cannot load brand kit")
    return url


def load_brand_kit_for_listing_pack(listing_pack_id: str) -> dict[str, Any] | None:
    """Return a small dict suitable for prompt injection, or None when no
    kit is configured for the workspace.

    Keeps the field names cosmetic ("primary_color" / "logo_url") rather
    than the DB column names so prompts read naturally.
    """
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT bk.name, bk.primary_color, bk.secondary_color,
                       bk.accent_color, bk.font_family, bk.tagline,
                       a.storage_key AS logo_storage_key
                  FROM brand_kits bk
                  JOIN listing_packs lp
                    ON lp.workspace_id = bk.workspace_id
             LEFT JOIN assets a
                    ON a.id = bk.logo_asset_id
                 WHERE lp.id = %s
                 LIMIT 1
                """,
                (listing_pack_id,),
            )
            row = cur.fetchone()
    if row is None:
        return None

    kit: dict[str, Any] = {"name": row["name"]}
    for k in ("primary_color", "secondary_color", "accent_color", "font_family", "tagline"):
        if row.get(k):
            kit[k] = row[k]
    if row.get("logo_storage_key"):
        from urllib.parse import quote

        kit["logo_url"] = (
            f"/api/assets/by-key/{quote(row['logo_storage_key'], safe='')}/raw"
        )
    return kit
