"""Load active platform_rules from Postgres into RuleSpec objects.

Caches per (platform, category) tuple in-process. Cache is busted whenever
`reload_rules()` is called explicitly (D11+ will wire this to a Postgres
NOTIFY trigger so rule changes propagate without a restart).
"""

from __future__ import annotations

import logging
import os
from typing import Iterable

import psycopg
from psycopg.rows import dict_row

from .rules.seed import from_db_row
from .schemas import PlatformName, RuleSpec

logger = logging.getLogger("listpack.compliance.loader")

_CACHE: dict[tuple[str, str | None], list[RuleSpec]] = {}


def _postgres_url() -> str:
    url = os.environ.get("POSTGRES_URL")
    if not url:
        raise RuntimeError(
            "POSTGRES_URL not set; cannot load rules from platform_rules table."
        )
    return url


def reload_rules() -> None:
    """Bust the in-process rule cache. Called by /v1/compliance/rules/reload."""
    _CACHE.clear()
    logger.info("rule cache cleared")


def load_active_rules(
    target_platform: PlatformName,
    target_category: str | None = None,
) -> list[RuleSpec]:
    """Return all active rules that apply to (platform, category).

    Includes:
    - Rules matching exactly this platform (e.g. amazon.*)
    - Global rules (catalog category-scoped) where applies_to_category contains
      `target_category`, or where applies_to_category is None (truly global).
    """
    cache_key = (target_platform, target_category)
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT *
                FROM platform_rules
                WHERE (platform = %s OR platform = 'global')
                  AND superseded_at IS NULL
                ORDER BY rule_key
                """,
                (target_platform,),
            )
            rows = cur.fetchall()

    rules: list[RuleSpec] = []
    for row in rows:
        spec = from_db_row(row)
        if spec.applies_to_category:
            if target_category is None:
                continue
            if target_category not in spec.applies_to_category:
                continue
        rules.append(spec)

    _CACHE[cache_key] = rules
    logger.debug(
        "loaded %d rules for (platform=%s, category=%s)",
        len(rules),
        target_platform,
        target_category,
    )
    return rules


def list_all_active_rules() -> Iterable[RuleSpec]:
    """For /v1/compliance/rules listing. Not cached — admin-only path."""
    with psycopg.connect(_postgres_url()) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM platform_rules WHERE superseded_at IS NULL "
                "ORDER BY platform, rule_key"
            )
            for row in cur.fetchall():
                yield from_db_row(row)
