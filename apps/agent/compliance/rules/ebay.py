"""eBay picture policy rules (PRD § 03 § 5).

eBay is mid-strict: explicit picture policy bans borders, watermarks,
text overlays, and URLs in images. Minimum dimensions for zoom.
"""

from __future__ import annotations

from ..schemas import RuleSeverity, RuleSpec

RULES: list[RuleSpec] = [
    RuleSpec(
        rule_key="ebay.picture.dimension_min",
        platform="ebay",
        applies_to_slot="any",
        detector_type="pixel_dimension",
        spec={"min_long_edge": 500},
        severity=RuleSeverity.block,
        auto_fix={"type": "resize", "target_long_edge": 1600},
        display_title={"en": "Picture below eBay minimum", "zh": "图片小于 eBay 最低要求"},
        display_message={
            "en": "eBay requires the longest side ≥ 500 px; recommends ≥ 1600 px for zoom.",
            "zh": "eBay 要求长边 ≥ 500 像素;推荐 ≥ 1600 像素以启用 zoom。",
        },
        fix_cta={"en": "Upscale to 1600 px", "zh": "放大到 1600 像素"},
        source_url="https://www.ebay.com/help/policies/listing-policies/picture-policy?id=4370",
    ),
    RuleSpec(
        rule_key="ebay.picture.no_border",
        platform="ebay",
        applies_to_slot="any",
        detector_type="border_detection",
        spec={"tolerance_px": 3, "min_edge_uniformity": 0.95, "strip_pct": 0.02},
        severity=RuleSeverity.block,
        auto_fix={"type": "crop_to_fill_ratio", "target_ratio": 0.95},
        display_title={"en": "Border detected", "zh": "检测到边框"},
        display_message={
            "en": "eBay forbids borders, frames, or decorative strips in product pictures.",
            "zh": "eBay 禁止商品图中的边框 / 装饰条 / 装饰色块。",
        },
        fix_cta={"en": "Crop borders", "zh": "智能裁掉边框"},
        source_url="https://www.ebay.com/help/policies/listing-policies/picture-policy?id=4370",
    ),
    RuleSpec(
        rule_key="ebay.picture.no_text_overlay",
        platform="ebay",
        applies_to_slot="any",
        detector_type="text_in_image",
        spec={"allowed": False, "min_confidence": 0.7, "min_text_length": 2},
        severity=RuleSeverity.block,
        auto_fix={"type": "remove_text", "inpaint_model": "lama"},
        display_title={"en": "Text overlay on image", "zh": "图上有文字叠加"},
        display_message={
            "en": "eBay bans text/URL/watermark overlays in listing pictures.",
            "zh": "eBay 禁止图片上叠加文字 / 网址 / 水印。",
        },
        fix_cta={"en": "Remove text", "zh": "AI 抹除文字"},
        source_url="https://www.ebay.com/help/policies/listing-policies/picture-policy?id=4370",
    ),
    RuleSpec(
        rule_key="ebay.picture.no_url_in_image",
        platform="ebay",
        applies_to_slot="any",
        detector_type="category_forbidden_text",
        spec={
            "keywords": ["www.", "http://", "https://", ".com", ".net", ".cn", ".io"],
            "min_confidence": 0.5,
            "case_sensitive": False,
        },
        severity=RuleSeverity.block,
        auto_fix={"type": "remove_text", "inpaint_model": "lama"},
        display_title={"en": "URL detected in picture", "zh": "图片中检测到网址"},
        display_message={
            "en": "eBay bans URLs in listing pictures; promotes off-site selling.",
            "zh": "eBay 禁止商品图中包含网址 (引流到站外是违规)。",
        },
        fix_cta={"en": "Remove URL", "zh": "抹除网址"},
        source_url="https://www.ebay.com/help/policies/listing-policies/picture-policy?id=4370",
    ),
]
