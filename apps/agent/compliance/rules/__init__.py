"""Declarative rule sets. Each module exports a `RULES: list[RuleSpec]`.

D4 ships Amazon main-image core rules. D9 will add the rest of the
platforms (Shopify/eBay/Temu/SHEIN) plus category-specific rules, then
seed them into the `platform_rules` PG table via `seed.py`.
"""

from .amazon import RULES as AMAZON_RULES
from .categories import RULES as CATEGORY_RULES
from .ebay import RULES as EBAY_RULES
from .shein import RULES as SHEIN_RULES
from .shopify import RULES as SHOPIFY_RULES
from .temu import RULES as TEMU_RULES

ALL_RULES = [
    *AMAZON_RULES,
    *SHOPIFY_RULES,
    *EBAY_RULES,
    *TEMU_RULES,
    *SHEIN_RULES,
    *CATEGORY_RULES,
]

__all__ = [
    "AMAZON_RULES",
    "SHOPIFY_RULES",
    "EBAY_RULES",
    "TEMU_RULES",
    "SHEIN_RULES",
    "CATEGORY_RULES",
    "ALL_RULES",
]
