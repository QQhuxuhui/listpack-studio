"""SHEIN open-platform image rules (PRD § 03 § 7).

Apparel-dominant catalog — aspect ratio matters more than resolution.
"""

from __future__ import annotations

from ..schemas import RuleSeverity, RuleSpec

RULES: list[RuleSpec] = [
    RuleSpec(
        rule_key="shein.catalog.file_size_max",
        platform="shein",
        applies_to_slot="any",
        detector_type="file_size",
        spec={"max_bytes": 3 * 1024 * 1024},  # 3 MB
        severity=RuleSeverity.block,
        auto_fix={
            "type": "compress",
            "target_bytes": int(2.5 * 1024 * 1024),
            "quality": 85,
        },
        display_title={"en": "SHEIN: file too large", "zh": "SHEIN 文件过大"},
        display_message={
            "en": "SHEIN catalog images must be ≤ 3 MB.",
            "zh": "SHEIN 商品图必须 ≤ 3 MB。",
        },
        fix_cta={"en": "Compress to 2.5 MB", "zh": "压缩到 2.5 MB"},
        source_url="https://open.sheincorp.com/documents/faq-detail/4",
    ),
    RuleSpec(
        rule_key="shein.catalog.dimension_min",
        platform="shein",
        applies_to_slot="any",
        detector_type="pixel_dimension",
        spec={"min_long_edge": 900},
        severity=RuleSeverity.warn,
        auto_fix={"type": "resize", "target_long_edge": 2200},
        display_title={"en": "Below SHEIN recommended dimension", "zh": "低于 SHEIN 推荐尺寸"},
        display_message={
            "en": "SHEIN recommends 900-2200 px for the longer side (1:1, 3:4, 4:5 ratios).",
            "zh": "SHEIN 推荐长边 900-2200 像素 (1:1 / 3:4 / 4:5 比例)。",
        },
        fix_cta={"en": "Upscale to 2200 px", "zh": "放大到 2200 像素"},
        source_url="https://open.sheincorp.com/documents/faq-detail/4",
    ),
    RuleSpec(
        rule_key="shein.catalog.format",
        platform="shein",
        applies_to_slot="any",
        detector_type="file_format",
        spec={"allowed": ["jpeg", "png"]},
        severity=RuleSeverity.block,
        auto_fix={"type": "convert_format", "target_format": "jpeg"},
        display_title={"en": "Unsupported format on SHEIN", "zh": "SHEIN 不支持的格式"},
        display_message={
            "en": "SHEIN catalog accepts JPEG and PNG only.",
            "zh": "SHEIN 商品图仅支持 JPEG / PNG。",
        },
        fix_cta={"en": "Convert to JPEG", "zh": "转 JPEG"},
        source_url="https://open.sheincorp.com/documents/faq-detail/4",
    ),
]
