"""Declarative rule sets. Each module exports a `RULES: list[RuleSpec]`.

D4 ships Amazon main-image core rules. D9 will add the rest of the
platforms (Shopify/eBay/Temu/SHEIN) plus category-specific rules, then
seed them into the `platform_rules` PG table via `seed.py`.
"""

from .amazon import RULES as AMAZON_RULES

ALL_RULES = [*AMAZON_RULES]

__all__ = ["AMAZON_RULES", "ALL_RULES"]
