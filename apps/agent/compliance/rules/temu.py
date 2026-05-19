"""Temu seller portal image rules (PRD § 03 § 6).

Temu is strict + opaque. We seed the most-violated rules first.
Rules change with each semi-managed wave (Q1/Q3 2025 updates) — version
column on platform_rules lets us iterate without breaking existing reports.
"""

from __future__ import annotations

from ..schemas import RuleSeverity, RuleSpec

RULES: list[RuleSpec] = [
    RuleSpec(
        rule_key="temu.main_image.dimension_min",
        platform="temu",
        applies_to_slot="main",
        detector_type="pixel_dimension",
        spec={"min_long_edge": 1600},
        severity=RuleSeverity.block,
        auto_fix={"type": "resize", "target_long_edge": 1600},
        display_title={
            "en": "Temu requires ≥ 1600 px main image",
            "zh": "Temu 主图要求 ≥ 1600 像素",
        },
        display_message={
            "en": "Temu rejects main images under 1600 px on the longest side at upload time.",
            "zh": "Temu 主图最长边 < 1600 像素会在上传环节直接被拒。",
        },
        fix_cta={"en": "Upscale to 1600 px", "zh": "放大到 1600 像素"},
        source_url="https://www.jjrlab.com/news/temu-product-compliance-guide.html",
    ),
    RuleSpec(
        rule_key="temu.main_image.background_white_or_neutral",
        platform="temu",
        applies_to_slot="main",
        detector_type="background_color",
        spec={
            "target_rgb": [255, 255, 255],
            "tolerance": 8,  # less strict than Amazon's 2 but still white
            "sample_zones": "edges_4",
        },
        severity=RuleSeverity.block,
        auto_fix={"type": "whiten_background", "method": "ai_remove_bg"},
        display_title={"en": "Background not white enough", "zh": "背景非白"},
        display_message={
            "en": "Temu main images must use white or close-to-white background.",
            "zh": "Temu 主图必须白底或接近白的中性色背景。",
        },
        fix_cta={"en": "Whiten background", "zh": "AI 变白底"},
        source_url="https://www.jjrlab.com/news/temu-product-compliance-guide.html",
    ),
    RuleSpec(
        rule_key="temu.main_image.no_text",
        platform="temu",
        applies_to_slot="main",
        detector_type="text_in_image",
        spec={"allowed": False, "min_confidence": 0.7, "min_text_length": 2},
        severity=RuleSeverity.block,
        auto_fix={"type": "remove_text", "inpaint_model": "lama"},
        display_title={"en": "Text in main image", "zh": "主图含文字"},
        display_message={
            "en": "Temu main images cannot contain any text, logo, or watermark.",
            "zh": "Temu 主图禁止任何文字 / Logo / 水印。",
        },
        fix_cta={"en": "Remove text", "zh": "AI 抹除文字"},
        source_url="https://www.jjrlab.com/news/temu-product-compliance-guide.html",
    ),
    RuleSpec(
        rule_key="temu.main_image.no_chinese_brand_text",
        platform="temu",
        applies_to_slot="main",
        detector_type="category_forbidden_text",
        spec={
            "keywords": [
                # Common ZH brand-name patterns that violate platform global-image policy
                "牌", "品牌", "厂家", "公司",
            ],
            "min_confidence": 0.6,
        },
        severity=RuleSeverity.warn,
        auto_fix={"type": "remove_text", "inpaint_model": "lama"},
        display_title={
            "en": "Chinese brand text detected",
            "zh": "检测到中文品牌名 / 厂家信息",
        },
        display_message={
            "en": "Temu global images shouldn't carry Chinese brand attribution; "
            "the platform localises listings.",
            "zh": "Temu 全球图禁止中文品牌 / 厂家署名;平台本地化展示。",
        },
        fix_cta={"en": "Remove brand text", "zh": "抹除品牌文字"},
        source_url="https://www.jjrlab.com/news/temu-product-compliance-guide.html",
    ),
    RuleSpec(
        rule_key="temu.main_image.no_watermark",
        platform="temu",
        applies_to_slot="main",
        detector_type="border_detection",  # reuse for visible frame/strip watermarks
        spec={"tolerance_px": 3, "min_edge_uniformity": 0.95, "strip_pct": 0.02},
        severity=RuleSeverity.block,
        display_title={"en": "Watermark / frame detected", "zh": "检测到水印 / 边框"},
        display_message={
            "en": "Temu rejects main images with watermarks, decorative frames, or platform logos.",
            "zh": "Temu 主图禁止水印 / 装饰边框 / 平台 Logo。",
        },
        source_url="https://www.jjrlab.com/news/temu-product-compliance-guide.html",
    ),
]
