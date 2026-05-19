"""Amazon main-image rules (PRD § 03 § 3.1).

D4 ships the 5 detector-backed rules that are implemented in
`compliance.detectors.*`:

  1. dimension_min     — long edge ≥ 1000 px (zoom requirement)
  2. dimension_max     — long edge ≤ 10000 px
  3. file_size_max     — file ≤ 10 MB
  4. format            — JPEG / PNG / TIFF only
  5. color_space       — sRGB / RGB strict for A+ Content
  6. background_white  — pure white pixels at edges (tolerance ≤ 2)

Rules 7-14 (product_fill_ratio, no_text, no_watermark, no_props_or_models,
no_border, halo_edge, shadow_intensity, no_packaging) land in D5-D9 as the
detectors they depend on become available.

Source: PRD docs/prd/03-compliance-engine.md § 3.1
Authoritative origin: Amazon Seller Central Help & Seller Forums
"""

from __future__ import annotations

from ..schemas import RuleSeverity, RuleSpec

RULES: list[RuleSpec] = [
    RuleSpec(
        rule_key="amazon.main_image.dimension_min",
        platform="amazon",
        applies_to_slot="main",
        detector_type="pixel_dimension",
        spec={"min_long_edge": 1000},
        severity=RuleSeverity.block,
        auto_fix={"type": "resize", "target_long_edge": 2000},
        display_title={
            "en": "Main image too small",
            "zh": "主图分辨率不足",
        },
        display_message={
            "en": "Amazon requires the longest side ≥ 1000 px to enable zoom.",
            "zh": "Amazon 主图最长边需 ≥ 1000 像素，否则无法启用 zoom。",
        },
        fix_cta={"en": "Upscale to 2000 px", "zh": "放大到 2000 像素"},
        source_url="https://sellercentral.amazon.com/help/hub/reference/external/G1881",
    ),
    RuleSpec(
        rule_key="amazon.main_image.dimension_max",
        platform="amazon",
        applies_to_slot="main",
        detector_type="pixel_dimension",
        spec={"max_long_edge": 10000},
        severity=RuleSeverity.block,
        auto_fix={"type": "resize", "target_long_edge": 5000},
        display_title={"en": "Main image too large", "zh": "主图分辨率过高"},
        display_message={
            "en": "Amazon caps the longest side at 10000 px.",
            "zh": "Amazon 主图最长边 ≤ 10000 像素。",
        },
        fix_cta={"en": "Resize to 5000 px", "zh": "降至 5000 像素"},
        source_url="https://sellercentral.amazon.com/help/hub/reference/external/G1881",
    ),
    RuleSpec(
        rule_key="amazon.main_image.file_size_max",
        platform="amazon",
        applies_to_slot="main",
        detector_type="file_size",
        spec={"max_bytes": 10 * 1024 * 1024},
        severity=RuleSeverity.block,
        auto_fix={"type": "compress", "target_bytes": 8 * 1024 * 1024, "quality": 85},
        display_title={"en": "Main image file too big", "zh": "主图文件过大"},
        display_message={
            "en": "Amazon main images must be ≤ 10 MB.",
            "zh": "Amazon 主图文件大小 ≤ 10 MB。",
        },
        fix_cta={"en": "Compress to 8 MB", "zh": "压缩到 8 MB"},
        source_url="https://sellercentral.amazon.com/help/hub/reference/external/G1881",
    ),
    RuleSpec(
        rule_key="amazon.main_image.format",
        platform="amazon",
        applies_to_slot="main",
        detector_type="file_format",
        spec={"allowed": ["jpeg", "png", "tiff"]},
        severity=RuleSeverity.block,
        auto_fix={"type": "convert_format", "target_format": "jpeg"},
        display_title={"en": "Unsupported image format", "zh": "图片格式不支持"},
        display_message={
            "en": "Amazon only accepts JPEG, PNG, or non-animated TIFF for main images.",
            "zh": "Amazon 主图仅接受 JPEG / PNG / 非动画 TIFF。",
        },
        fix_cta={"en": "Convert to JPEG", "zh": "转为 JPEG"},
        source_url="https://sellercentral.amazon.com/help/hub/reference/external/G1881",
    ),
    RuleSpec(
        rule_key="amazon.main_image.color_space",
        platform="amazon",
        applies_to_slot="main",
        detector_type="color_space",
        spec={"allowed": ["sRGB", "RGB"]},
        severity=RuleSeverity.warn,
        auto_fix={"type": "convert_color_space", "target": "srgb"},
        display_title={"en": "Color space not sRGB", "zh": "色彩空间非 sRGB"},
        display_message={
            "en": "sRGB is strongly recommended; CMYK risks being rejected, especially in A+ Content.",
            "zh": "推荐 sRGB；CMYK 在 A+ Content 中会被拒。",
        },
        fix_cta={"en": "Convert to sRGB", "zh": "转为 sRGB"},
        source_url="https://sellercentral.amazon.com/help/hub/reference/external/G1881",
    ),
    RuleSpec(
        rule_key="amazon.main_image.background_white",
        platform="amazon",
        applies_to_slot="main",
        detector_type="background_color",
        spec={
            "target_rgb": [255, 255, 255],
            "tolerance": 2,
            "sample_zones": "edges_4",
            "strip_pct": 0.05,
            "sample_step": 4,
        },
        severity=RuleSeverity.block,
        auto_fix={"type": "whiten_background", "method": "ai_remove_bg"},
        display_title={"en": "Background is not pure white", "zh": "背景非纯白"},
        display_message={
            "en": "Amazon main images require a pure white background (RGB 255,255,255). "
            "Even RGB 254,254,254 triggers suppression.",
            "zh": "Amazon 主图必须纯白 (RGB 255,255,255)，偏差 ≤2。",
        },
        fix_cta={"en": "Auto-whiten background", "zh": "AI 一键变白底"},
        source_url="https://sellercentral.amazon.com/help/hub/reference/external/G1881",
    ),
    RuleSpec(
        rule_key="amazon.main_image.product_fill_ratio",
        platform="amazon",
        applies_to_slot="main",
        detector_type="product_fill_ratio",
        spec={
            "min_ratio": 0.85,
            "method": "white_threshold",
            "bg_tolerance": 5,
        },
        severity=RuleSeverity.block,
        auto_fix={
            "type": "crop_to_fill_ratio",
            "target_ratio": 0.87,
            "preserve_subject": True,
        },
        display_title={
            "en": "Product fills less than 85% of the frame",
            "zh": "商品占图 < 85%",
        },
        display_message={
            "en": "Amazon requires the product to fill at least 85% of the longer side.",
            "zh": "Amazon 要求商品占长边 ≥ 85%。",
        },
        fix_cta={"en": "Auto-crop to 87%", "zh": "智能裁剪到 87%"},
        source_url="https://www.rewarx.com/blogs/amazon-main-image-85-percent-frame-fill-guide-2026",
    ),
    RuleSpec(
        rule_key="amazon.main_image.no_border",
        platform="amazon",
        applies_to_slot="main",
        detector_type="border_detection",
        spec={"tolerance_px": 3, "min_edge_uniformity": 0.95, "strip_pct": 0.02},
        severity=RuleSeverity.block,
        auto_fix={"type": "crop_to_fill_ratio", "target_ratio": 0.87},
        display_title={"en": "Decorative border detected", "zh": "检测到装饰边框"},
        display_message={
            "en": "Amazon main images must not have borders, frames, or coloured strips.",
            "zh": "Amazon 主图禁止任何边框、装饰条或色块。",
        },
        fix_cta={"en": "Crop borders", "zh": "智能裁掉边框"},
        source_url="https://sellercentral.amazon.com/help/hub/reference/external/G1881",
    ),
    RuleSpec(
        rule_key="amazon.main_image.halo_edge_clean",
        platform="amazon",
        applies_to_slot="main",
        detector_type="halo_edge",
        spec={"max_halo_intensity": 0.25, "halo_band_px": 6},
        severity=RuleSeverity.warn,
        auto_fix={"type": "smooth_halo_edges", "alpha_feather_px": 2},
        display_title={"en": "Rough cut-out edges (halo)", "zh": "抠图边缘粗糙 (halo)"},
        display_message={
            "en": "AI-cut backgrounds often leave faint halos. Amazon's auto-checker flags these.",
            "zh": "AI 抠图边缘有光晕；Amazon 自动审核会标记。",
        },
        fix_cta={"en": "Smooth edges", "zh": "羽化边缘"},
        source_url="https://sellercentral.amazon.com/help/hub/reference/external/G1881",
    ),
    RuleSpec(
        rule_key="amazon.main_image.shadow_not_heavy",
        platform="amazon",
        applies_to_slot="main",
        detector_type="shadow_intensity",
        spec={"max_dark_pct": 0.20, "dark_lum_threshold": 60},
        severity=RuleSeverity.warn,
        auto_fix={"type": "reduce_shadow_intensity", "target_dark_pct": 0.10},
        display_title={"en": "Heavy shadow", "zh": "阴影过重"},
        display_message={
            "en": "More than 20% of pixels are dark — Amazon may suppress as 'borders'.",
            "zh": "暗部 > 20%，Amazon 可能识别为黑框抑制 listing。",
        },
        fix_cta={"en": "Reduce shadow", "zh": "降低阴影"},
        source_url="https://sellercentral.amazon.com/help/hub/reference/external/G1881",
    ),
]
