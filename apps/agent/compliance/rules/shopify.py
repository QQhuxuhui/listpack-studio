"""Shopify product-image rules (PRD § 03 § 4).

Shopify itself almost doesn't moderate, but there are 3 hidden constraints:
- Performance (Core Web Vitals) caps file size
- Theme dimensions assume specific aspect ratios
- App ecosystem expects alt text + variant images

D9 ships the always-applicable image-level rules; theme/variant rules
land in v2 once we know which themes the customer uses.
"""

from __future__ import annotations

from ..schemas import RuleSeverity, RuleSpec

RULES: list[RuleSpec] = [
    RuleSpec(
        rule_key="shopify.product_image.dimension_recommended",
        platform="shopify",
        applies_to_slot="any",
        detector_type="pixel_dimension",
        spec={"min_long_edge": 800},
        severity=RuleSeverity.info,
        auto_fix={"type": "resize", "target_long_edge": 2048},
        display_title={
            "en": "Image below recommended dimension",
            "zh": "图片低于推荐尺寸",
        },
        display_message={
            "en": "Shopify recommends ≥ 800 px (sweet spot 2048 px) so product zoom works.",
            "zh": "Shopify 建议长边 ≥ 800 像素 (最佳 2048 像素), 否则商品放大效果差。",
        },
        fix_cta={"en": "Upscale to 2048 px", "zh": "放大到 2048 像素"},
        source_url="https://help.shopify.com/en/manual/products/product-media",
    ),
    RuleSpec(
        rule_key="shopify.product_image.file_size_product",
        platform="shopify",
        applies_to_slot="any",
        detector_type="file_size",
        spec={"max_bytes": 200 * 1024},  # 200 KB
        severity=RuleSeverity.warn,
        auto_fix={
            "type": "compress",
            "target_bytes": 150 * 1024,
            "quality": 80,
        },
        display_title={"en": "Product image too heavy", "zh": "商品图过大"},
        display_message={
            "en": "Shopify product images should be < 200 KB so LCP < 2.5 s; "
            "every extra MB hurts Core Web Vitals + conversion.",
            "zh": "商品图建议 < 200 KB, 否则首屏 LCP > 2.5s, "
            "拖累 Core Web Vitals 与转化率。",
        },
        fix_cta={"en": "Compress to 150 KB", "zh": "压缩到 150 KB"},
        source_url="https://shopify.dev/docs/storefronts/themes/best-practices/performance",
    ),
    RuleSpec(
        rule_key="shopify.product_image.format_preferred",
        platform="shopify",
        applies_to_slot="any",
        detector_type="file_format",
        spec={"allowed": ["jpeg", "png", "webp", "avif", "gif"]},
        severity=RuleSeverity.info,
        auto_fix={"type": "convert_format", "target_format": "webp"},
        display_title={"en": "Format ok, but WebP is faster", "zh": "格式可用,但 WebP 更快"},
        display_message={
            "en": "Shopify CDN auto-serves WebP/AVIF if you upload it. JPEG/PNG works but is "
            "30-50% larger.",
            "zh": "Shopify CDN 直接服务 WebP/AVIF, 比 JPEG/PNG 小 30-50%。",
        },
        fix_cta={"en": "Convert to WebP", "zh": "转 WebP"},
        source_url="https://shopify.dev/docs/storefronts/themes/best-practices/performance",
    ),
    RuleSpec(
        rule_key="shopify.product_image.background_neutral",
        platform="shopify",
        applies_to_slot="any",
        detector_type="background_color",
        spec={
            "target_rgb": [255, 255, 255],
            "tolerance": 32,  # Shopify is FAR less strict than Amazon
            "sample_zones": "edges_4",
        },
        severity=RuleSeverity.info,
        auto_fix=None,
        display_title={"en": "Background isn't neutral", "zh": "背景非中性色"},
        display_message={
            "en": "Shopify doesn't require white, but a neutral background usually "
            "converts better than busy ones.",
            "zh": "Shopify 不强制白底,但中性背景的转化率通常更好。",
        },
        source_url="https://help.shopify.com/en/manual/products/product-media",
    ),
]
