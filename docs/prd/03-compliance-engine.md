# 03 · 合规规则引擎

> ListPack 的核心护城河。所有竞品都只做"图美化"，没人做完整的多平台 × 多法规合规检查。这层难复制，因为：
> - 需要持续跟踪 5+ 平台政策（每周更新）
> - 需要法规专业理解（EU AI Act / 加州 SB 942 / 中国《标识办法》）
> - 需要工程化每条规则成"可检测 + 可修复"
>
> 调研依据：[`docs/research/03-platform-compliance.md`](../research/03-platform-compliance.md)

---

## 1. 设计目标

### 1.1 三层目标

| 层 | 目标 | 用户感知 |
|---|---|---|
| **L1 检测** | 上传图 → 5 秒内出 pass/fail 报告 + 每条不合规的红线条款引用 | "为什么这张图过不了？" |
| **L2 修复** | 失败规则中可自动修复的，一键修复（消耗 1 SKU 配额） | "怎么改？" |
| **L3 申诉**（v2） | 真被平台拒了，自动生成 Plan of Action 草稿 | "被拒了怎么办？" |

### 1.2 一句话价值主张

> **"Upload first, check first. 100% Amazon/Shopify/Temu/SHEIN review pass guarantee or refund."**

退款承诺要敢写——因为 Pass-First-Time Rate ≥ 90%（北极星指标之一）。

### 1.3 反向设计：不做"合规水印"宣传

参考 [04-user-pain-points § D4](../research/04-user-pain-points-jtbd.md)：
- 用户**讨厌**主动声明"AI 生成"（怕被平台特殊对待）
- 用户**想要**的是"确保通过审核"
- ListPack 仍然嵌入合规元数据（C2PA / EU AI Act 隐式水印），**但对用户话术写"Safety Layer / 通过保证"，不写"AI 披露"**

---

## 2. 规则库 Schema

### 2.1 PlatformRule 完整字段

```typescript
interface PlatformRule {
  // 标识
  id: string                              // uuid
  rule_key: string                        // "amazon.main_image.background_white"
  platform: "amazon" | "shopify" | "ebay" | "temu" | "shein" | "global"
  applies_to_slot: "main" | "secondary" | "a_plus" | "banner" | "any"
  applies_to_category?: string[]          // ["apparel", "supplements"] or null = all
  
  // 元信息
  version: number                         // 每次规则改动 +1
  effective_from: Date
  superseded_at?: Date                    // null = 当前有效
  source_url: string                      // Amazon 官方页 / 法规原文链接
  source_type: "platform_official" | "law" | "community_derived"
  last_verified_at: Date                  // 上次人工核对时间
  
  // 严重度
  severity: "block" | "warn" | "info"     // block = 上传会被拒；warn = 影响排名；info = 建议
  
  // 检测规格
  detector: Detector                      // 见 § 2.2
  
  // 修复方案
  auto_fix?: AutoFix                      // 见 § 2.3，null = 不可自动修复
  
  // 用户文案
  display_title: { en: string; zh: string }
  display_message: { en: string; zh: string }
  fix_cta?: { en: string; zh: string }
}
```

### 2.2 Detector 类型

每条规则的检测算法通过 `detector` 字段描述，引擎根据 `type` 调对应的检测器：

```typescript
type Detector =
  | { type: "pixel_dimension"; min_long_edge?: number; max_long_edge?: number }
  | { type: "file_size"; max_bytes: number }
  | { type: "file_format"; allowed: string[] }
  | { type: "color_space"; allowed: string[] }
  | { type: "background_color"; target_rgb: [number, number, number]; tolerance: number; sample_zones: "edges_4" | "corners_4" | "full" }
  | { type: "product_fill_ratio"; min_ratio: number; method: "sam_segmentation" | "alpha_channel" }
  | { type: "text_in_image"; allowed: boolean; ocr_engine: "tesseract" | "paddleocr" | "google_vision" }
  | { type: "watermark_detection"; threshold: number; model: "restb_watermark_v2" }
  | { type: "border_detection"; method: "hough_lines"; tolerance_px: number }
  | { type: "object_count"; max_count: number; class_filter?: string[] }
  | { type: "person_in_image"; allowed: boolean; detector: "yolov8_person" }
  | { type: "halo_edge"; max_halo_intensity: number }
  | { type: "shadow_intensity"; max_dark_pct: number }
  | { type: "category_forbidden_text"; keywords: string[]; ocr_engine: string }
  | { type: "category_required_element"; required_text?: string[]; required_visual?: string }
  | { type: "mobile_text_legibility"; min_font_size_pt_at_1600px: number }
  | { type: "c2pa_manifest_present"; required: boolean }
  | { type: "ai_generated_disclosure"; required: boolean; placement?: "image_corner" | "metadata_only" }
  | { type: "ratio_aspect"; allowed_ratios: string[] /* "1:1", "4:5" */ }
  | { type: "custom_function"; function_id: string /* 复杂规则跑自定义 */ }
```

### 2.3 AutoFix 类型

```typescript
type AutoFix =
  | { type: "whiten_background"; method: "ai_remove_bg" | "color_replace" }
  | { type: "resize"; target_long_edge: number }
  | { type: "compress"; target_bytes: number; quality: number }
  | { type: "convert_format"; target_format: "jpeg" | "png" | "webp" }
  | { type: "convert_color_space"; target: "srgb" }
  | { type: "crop_to_fill_ratio"; target_ratio: number; preserve_subject: boolean }
  | { type: "remove_text"; ocr_engine: string; inpaint_model: string }
  | { type: "remove_watermark"; inpaint_model: string }
  | { type: "remove_object"; object_class: string; inpaint_model: string }
  | { type: "add_required_text"; text: string; position: string; style: object }
  | { type: "smooth_halo_edges"; alpha_feather_px: number }
  | { type: "reduce_shadow_intensity"; target_dark_pct: number }
  | { type: "add_c2pa_manifest"; manifest_data: object }
  | { type: "add_ai_disclosure_watermark"; placement: string; opacity: number }
  | { type: "regenerate_with_constraint"; constraint: object /* 重生整张图，喂新约束 */ }
```

---

## 3. Amazon 规则集（v1 P0，最详细）

Amazon 是合规绞肉机，规则最严。v1 必须把 Amazon 主图 10 条规则做到位。

### 3.1 Amazon 主图（Slot 1）— v1 P0 规则清单

| # | rule_key | severity | detector | auto_fix |
|---|---|---|---|---|
| 1 | `amazon.main_image.dimension_min` | block | `pixel_dimension { min_long_edge: 1000 }` | `resize { target: 2000 }` |
| 2 | `amazon.main_image.dimension_max` | block | `pixel_dimension { max_long_edge: 10000 }` | `resize { target: 5000 }` |
| 3 | `amazon.main_image.file_size_max` | block | `file_size { max_bytes: 10485760 }` | `compress { target: 8388608, quality: 85 }` |
| 4 | `amazon.main_image.format` | block | `file_format { allowed: ["jpeg", "png", "tiff"] }` | `convert_format { target: "jpeg" }` |
| 5 | `amazon.main_image.color_space` | warn | `color_space { allowed: ["sRGB"] }` | `convert_color_space { target: "srgb" }` |
| 6 | `amazon.main_image.background_white` | **block** | `background_color { target_rgb: [255,255,255], tolerance: 2, sample_zones: "edges_4" }` | `whiten_background { method: "ai_remove_bg" }` |
| 7 | `amazon.main_image.product_fill_ratio` | **block** | `product_fill_ratio { min_ratio: 0.85, method: "sam_segmentation" }` | `crop_to_fill_ratio { target_ratio: 0.87, preserve_subject: true }` |
| 8 | `amazon.main_image.no_text` | **block** | `text_in_image { allowed: false, ocr_engine: "paddleocr" }` | `remove_text { inpaint_model: "lama" }` |
| 9 | `amazon.main_image.no_watermark` | **block** | `watermark_detection { threshold: 0.7 }` | `remove_watermark { inpaint_model: "lama" }` |
| 10 | `amazon.main_image.no_props_or_models` | **block** | `person_in_image { allowed: false }` + `object_count { max: 1, class_filter: ["product"] }` | 不可自动修复 → 提示用户重拍 |
| 11 | `amazon.main_image.no_border` | block | `border_detection { method: "hough_lines", tolerance_px: 3 }` | `crop_to_fill_ratio` |
| 12 | `amazon.main_image.no_packaging` | warn | `custom_function { function_id: "detect_packaging_v1" }` | 不可自动 |
| 13 | `amazon.main_image.halo_edge_clean` | warn | `halo_edge { max_halo_intensity: 0.15 }` | `smooth_halo_edges { alpha_feather_px: 2 }` |
| 14 | `amazon.main_image.shadow_not_heavy` | warn | `shadow_intensity { max_dark_pct: 0.20 }` | `reduce_shadow_intensity` |

**实施优先级**：1-9 是 v1 P0（必须 90 天内全部上线），10-14 是 v1 P1。

### 3.2 Amazon 副图（Slot 2-7）

副图规则比主图宽松，但 Slot 4（infographic）有移动端文字可读性要求：

```typescript
{
  rule_key: "amazon.secondary_image.slot_4.text_legibility",
  applies_to_slot: "secondary",
  severity: "warn",
  detector: { 
    type: "mobile_text_legibility",
    min_font_size_pt_at_1600px: 24 
  },
  display_message: {
    zh: "在 1600px 副图上，文字字号 < 24pt 等效，移动端可能看不清",
    en: "Text font size below 24pt equivalent at 1600px—mobile users may not read it"
  }
}
```

### 3.3 Amazon A+ Content（Brand Registry）

```typescript
[
  {
    rule_key: "amazon.a_plus.module_dimension_hero",
    applies_to_slot: "a_plus",
    detector: { type: "pixel_dimension", exact: [970, 600] },
    auto_fix: { type: "resize", target_long_edge: 970 }
  },
  {
    rule_key: "amazon.a_plus.file_size_per_module",
    detector: { type: "file_size", max_bytes: 2097152 },
    auto_fix: { type: "compress", target_bytes: 524288, quality: 85 }
  },
  {
    rule_key: "amazon.a_plus.color_space_rgb_strict",
    severity: "block",
    detector: { type: "color_space", allowed: ["RGB", "sRGB"] },
    auto_fix: { type: "convert_color_space", target: "srgb" }
  },
  {
    rule_key: "amazon.a_plus.text_area_max",
    detector: { type: "custom_function", function_id: "text_area_pct_ocr" },
    spec: { max_text_area_pct: 30 }
  }
]
```

---

## 4. Shopify 规则集（v1 P1）

Shopify 平台几乎不审，但有性能 / SEO 隐性约束：

| rule_key | severity | detector | auto_fix |
|---|---|---|---|
| `shopify.product_image.dimension_recommended` | info | `pixel_dimension { min_long_edge: 800, recommended_long_edge: 2048 }` | `resize { target: 2048 }` |
| `shopify.product_image.file_size_product` | warn | `file_size { max_bytes: 204800 }` (200KB) | `compress { target: 153600, quality: 80 }` |
| `shopify.product_image.format_preferred` | info | `file_format { recommended: ["webp", "avif"] }` | `convert_format { target: "webp" }` |
| `shopify.product_image.alt_text_present` | warn | `custom_function { function_id: "check_listing_alt_text" }` | `add_required_text { type: "alt", text: "auto-generate" }` |
| `shopify.product_image.variant_dedicated` | warn | `custom_function { function_id: "check_variant_has_image" }` | 不可自动（需要用户分配） |

---

## 5. eBay 规则集（v1 P1）

| rule_key | severity | detector | auto_fix |
|---|---|---|---|
| `ebay.picture.dimension_min` | block | `pixel_dimension { min_long_edge: 500 }` | `resize { target: 1600 }` |
| `ebay.picture.no_border` | block | `border_detection { tolerance_px: 3 }` | `crop_to_fill_ratio` |
| `ebay.picture.no_watermark` | block | `watermark_detection` | `remove_watermark` |
| `ebay.picture.no_text_overlay` | block | `text_in_image { allowed: false }` | `remove_text` |
| `ebay.picture.no_url_in_image` | block | `custom_function { function_id: "ocr_url_pattern" }` | `remove_text` |

---

## 6. Temu 规则集（v1 P0 - 因为是差异化）

竞品几乎不做 Temu 合规——这是 ListPack 差异化要点：

| rule_key | severity | detector | auto_fix |
|---|---|---|---|
| `temu.main_image.dimension_min` | block | `pixel_dimension { min_long_edge: 1600 }` | `resize { target: 1600 }` |
| `temu.main_image.background_white_or_neutral` | block | `background_color { target_rgb: [255,255,255], tolerance: 8 }` | `whiten_background` |
| `temu.main_image.ratio_grid` | block | `ratio_aspect { allowed_ratios: ["1:1", "4:5", "3:4"] }` | `crop_to_fill_ratio` |
| `temu.main_image.no_chinese_brand_text` | warn | `category_forbidden_text { keywords: ["中文品牌名 patterns"] }` | `remove_text` |
| `temu.product.min_image_count` | block | `custom_function { function_id: "count_images_per_sku" }` | 提示用户上传至少 3 张 |

---

## 7. SHEIN 规则集（v1 P1 - 服装专垂）

| rule_key | severity | detector | auto_fix |
|---|---|---|---|
| `shein.catalog.ratio_portrait` | block | `ratio_aspect { allowed_ratios: ["1:1", "3:4", "4:5", "13:16"] }` | `crop_to_fill_ratio` |
| `shein.catalog.resolution_900_or_2200` | warn | `pixel_dimension { allowed: ["900x2200", "900x900", "2200x2200"] }` | `resize` |
| `shein.catalog.file_size_max` | block | `file_size { max_bytes: 3145728 }` | `compress` |

---

## 8. 品类规则（CategoryRule，跨平台）

不挂某个平台，根据 `Asset.category` 触发：

### 8.1 服装 / 配饰（apparel）
```typescript
{
  rule_key: "category.apparel.ghost_mannequin_or_flat_lay",
  severity: "info",
  detector: { type: "custom_function", function_id: "detect_garment_presentation" },
  display_message: { zh: "建议使用 ghost mannequin 或平铺展示，转化率更高" }
}
```

### 8.2 保健品 / 膳食补充剂（supplements）⚠️ 高风险品类
**ListPack v1 不主动支持这个品类，但如果用户选了，必须严格警告：**

```typescript
[
  {
    rule_key: "category.supplements.no_medical_claims",
    severity: "block",
    detector: { 
      type: "category_forbidden_text",
      keywords: [
        "cure", "treat", "heal", "prevent", "diagnose",
        "治愈", "治疗", "防止", "减肥前后"
      ]
    },
    display_message: { 
      zh: "❗ 保健品图禁止含医疗效果暗示词（FDA / Amazon Section 3 高风险）"
    }
  },
  {
    rule_key: "category.supplements.cgmp_disclaimer_required",
    severity: "warn",
    detector: { type: "category_required_element", required_text: ["disclaimer"] },
    display_message: { zh: "Amazon 2025.12 起补充剂全品类强制 cGMP，需展示认证" }
  }
]
```

### 8.3 儿童玩具（kids_toys）⚠️ 高风险
```typescript
[
  {
    rule_key: "category.kids_toys.cpsia_warning_visible",
    severity: "block",
    detector: { 
      type: "category_required_element",
      required_text: ["WARNING", "CHOKING HAZARD", "Small parts"]
    },
    display_message: { zh: "含小零件玩具必须显示 Choking hazard 警示" }
  },
  {
    rule_key: "category.kids_toys.age_grading_visible",
    severity: "warn",
    detector: { type: "category_required_element", required_text: ["age", "Ages \\d+"] }
  }
]
```

### 8.4 化妆品（cosmetics）⚠️ 高风险
```typescript
{
  rule_key: "category.cosmetics.no_disease_claims",
  severity: "block",
  detector: {
    type: "category_forbidden_text",
    keywords: [
      "wrinkle reduction", "acne treatment", "skin whitening",
      "去皱", "祛痘", "美白功效"
    ]
  }
}
```

### 8.5 食品（food）⚠️ 高风险
```typescript
{
  rule_key: "category.food.organic_natural_unsubstantiated",
  severity: "block",
  detector: {
    type: "category_forbidden_text",
    keywords: ["organic", "natural", "100% natural", "有机", "纯天然"],
    require_certification_present: true
  }
}
```

**v1 实施策略**：8.2-8.5 这 4 个高风险品类**在 UI 上显示但默认禁用**（用户选时弹"我们不建议为该品类生成 AI 图，因为合规风险高"）。等 v2 有专业合规支持再开。

### 8.6 v1 默认支持的安全品类

家居 / 文具 / 宠物用品 / 配饰 / 家具——这些是"非文字标签依赖" + AI 出图退货率低的甜蜜点品类。

---

## 9. 法规层规则（GlobalRule，跨平台跨品类）

### 9.1 欧盟 AI Act（2026.8.2 强制执行）

```typescript
[
  {
    rule_key: "global.eu_ai_act.c2pa_manifest_required",
    platform: "global",
    severity: "block",        // 卖到欧盟时
    applies_when: { user_market_includes: "EU" },
    detector: { type: "c2pa_manifest_present", required: true },
    auto_fix: { 
      type: "add_c2pa_manifest",
      manifest_data: {
        producer: "ListPack Studio",
        ai_generated: true,
        generator_model: "{auto-fill}",
        timestamp: "{auto-fill}"
      }
    }
  },
  {
    rule_key: "global.eu_ai_act.invisible_watermark",
    severity: "block",
    applies_when: { user_market_includes: "EU" },
    detector: { 
      type: "custom_function",
      function_id: "verify_invisible_watermark"
    },
    auto_fix: { type: "add_ai_disclosure_watermark", placement: "metadata_only" }
  }
]
```

### 9.2 美国加州 SB 942（2026.1.1）

```typescript
{
  rule_key: "global.california_sb942.latent_disclosure",
  applies_when: { 
    user_market_includes: "US", 
    listpack_monthly_active_users: ">=1000000"  // 触发条件
  },
  severity: "block",
  detector: { type: "c2pa_manifest_present", required: true },
  auto_fix: { type: "add_c2pa_manifest" },
  display_message: {
    en: "CA SB 942 requires AI-detection metadata for providers with 1M+ MAU"
  }
}
```

**注**：v1 阶段 MAU 不会到 100 万，这条规则在 spec 里待 v3 触发。

### 9.3 中国《标识办法》（2025.9.1 已生效）

```typescript
[
  {
    rule_key: "global.china_aigc.explicit_marker",
    applies_when: { user_market_includes: "CN" },
    severity: "block",
    detector: { 
      type: "ai_generated_disclosure",
      required: true,
      placement: "image_corner"
    },
    auto_fix: { 
      type: "add_ai_disclosure_watermark",
      placement: "image_corner",
      opacity: 0.6,
      text: "AI 生成"
    }
  },
  {
    rule_key: "global.china_aigc.metadata_marker",
    severity: "block",
    detector: { type: "c2pa_manifest_present", required: true },
    auto_fix: { type: "add_c2pa_manifest" }
  }
]
```

### 9.4 法规规则的 UI 处理

用户首次注册时选"主要销售市场"（多选：US / EU / CN / Global）。法规规则按市场自动触发，**不让用户单独选合规级别**——简化决策。

---

## 10. 检测算法实施清单

每个 detector `type` 对应一个实现模块。v1 必须实现以下 12 个：

| Detector type | 实现技术 | 难度 | v1 状态 |
|---|---|---|---|
| `pixel_dimension` | Sharp / Pillow 读 metadata | 极易 | ✅ 必须 |
| `file_size` | fs.statSync | 极易 | ✅ 必须 |
| `file_format` | mime detect | 极易 | ✅ 必须 |
| `color_space` | ICC profile 读取（Sharp / ImageMagick） | 易 | ✅ 必须 |
| `background_color` | 边缘像素采样 + RGB 距离 | 中 | ✅ 必须 |
| `product_fill_ratio` | SAM 2.1 / RMBG-2.0 分割 + bbox 计算 | 中 | ✅ 必须 |
| `text_in_image` | PaddleOCR（中英文最佳） | 中 | ✅ 必须 |
| `watermark_detection` | restb.ai API 或开源 watermark-detection 模型 | 中 | ✅ 必须 |
| `border_detection` | 边缘检测 + Hough 变换（OpenCV） | 中 | ✅ 必须 |
| `object_count` | YOLOv8 物体检测 | 易 | ✅ 必须 |
| `person_in_image` | YOLOv8 + person class | 易 | ✅ 必须 |
| `category_forbidden_text` | OCR + 关键词库 | 易 | ✅ 必须 |
| `halo_edge` | alpha 通道边缘锐度分析 | 中 | P1 |
| `shadow_intensity` | 暗部直方图 | 易 | P1 |
| `mobile_text_legibility` | OCR 拿字号 + 1600px 换算 | 中 | P1 |
| `c2pa_manifest_present` | C2PA SDK | 中 | ✅ 必须（v1 因为要写） |
| `custom_function` | 各种业务函数注册表 | 视函数 | 视具体函数 |

---

## 11. 一键修复（Auto-Fix）实施清单

| AutoFix type | 实现技术 | 模型/库 | v1 |
|---|---|---|---|
| `whiten_background` | AI 抠图 + 替换白底 | RMBG-2.0 / Photoroom API / Replicate | ✅ |
| `resize` | Sharp / libvips | — | ✅ |
| `compress` | Sharp 质量参数 | — | ✅ |
| `convert_format` | Sharp | — | ✅ |
| `convert_color_space` | Sharp + ICC profile | — | ✅ |
| `crop_to_fill_ratio` | SAM 分割 + smart crop | — | ✅ |
| `remove_text` | inpainting | LaMa / Flux Fill | ✅ |
| `remove_watermark` | inpainting | LaMa / Flux Fill | ✅ |
| `remove_object` | inpainting | LaMa / SAM + Flux Fill | P1 |
| `add_required_text` | 代码渲染（libvips text） | — | ✅ |
| `smooth_halo_edges` | alpha feather | Sharp | ✅ |
| `add_c2pa_manifest` | C2PA SDK | c2pa-rs / c2pa-node | ✅ |
| `add_ai_disclosure_watermark` | 可见水印渲染 | Sharp | ✅ |
| `regenerate_with_constraint` | 调用 Agent 重新生成 | — | ✅ |

---

## 12. 规则库版本化 + 实时跟踪

### 12.1 规则版本化

每条规则都有 `version`、`effective_from`、`superseded_at`：
- 检测时按"当前生效的最高 version"
- 历史 ComplianceReport 记录用的是 `rule_set_version`，便于追溯（"3 个月前为什么这张图过了"）

### 12.2 政策跟踪机制

平台政策每月会变。建立内部流程：

| 机制 | 频率 | 实施 |
|---|---|---|
| Amazon Seller Forum RSS 订阅 | 每日 | 自动抓取 → LLM 摘要变更点 → Slack 通知 |
| 5 大平台官方政策页变更监控 | 每周 | diff 检测脚本 → 人工 review |
| 法规公告订阅（EU / FTC / 网信办） | 每月 | 邮件订阅 + 人工跟进 |
| Trustpilot / G2 差评关键词监控 | 每月 | 看竞品被拒模式 |
| 用户被拒 case 回流 | 持续 | 用户上传 Amazon 拒信 → 提取规则 → 入库 |

### 12.3 规则更新流程

```
新政策出现
  → 规则草案（detector + auto_fix + display_message + source_url）
  → 影子模式（运行 7 天，不影响用户决策，只记录命中率）
  → 验证准确率（误判 < 5%）
  → 上线（severity 先 warn，2 周后升 block）
```

---

## 13. 申诉助手（v2 功能）

被平台拒后，自动生成 Plan of Action（POA）草稿：

```
输入：
- Amazon 拒信原文（用户粘贴）
- 被拒 listing 链接
- 原始图 + ComplianceReport

输出（POA 草稿）：
- Root Cause（基于规则库匹配的红线条款）
- Corrective Action（已自动修复的内容）
- Preventive Action（未来如何避免）
- 附件：合规元数据证明 + 修复前后对比图
```

实现：LLM + POA 模板库（不同违规类型不同模板）。

---

## 14. 引擎性能 + 缓存

### 14.1 性能目标

| 操作 | 目标延迟 | 实现 |
|---|---|---|
| 单图单平台检查（10 条 Amazon 规则） | < 3s | 并行执行各 detector |
| 单图全平台检查（5 平台 × 平均 10 条）| < 8s | 跨平台共享相同 detector（如 dimension 只跑 1 次） |
| 一键自动修复 | < 30s | 修复后自动重检 |

### 14.2 缓存策略

```
ComplianceReport 缓存 key = hash(asset_storage_key + rule_set_version + platform)
TTL = 7 天 或 直到规则库 version 变化
```

同图 + 同规则 → 直接返回历史 report，0 成本。

### 14.3 detector 共享

5 个平台都有 "white background" 规则，但规格不同：
- Amazon: tolerance 2（最严）
- Temu: tolerance 8
- eBay: 推荐但不强制

实现一次 `background_color` detector，给不同 tolerance 返回不同 pass/fail。

---

## 15. v2 / v3 规则引擎扩展

### 15.1 v2：用户自定义规则

Brand/Agency 段允许写自定义规则（"我的品牌不允许出现红色"）：

```typescript
{
  rule_key: "custom.brand_x.no_red",
  workspace_id: "ws_x",            // 仅对该 workspace 生效
  severity: "warn",
  detector: { type: "custom_function", function_id: "color_dominance_check" },
  spec: { forbidden_colors: ["#FF0000"], tolerance: 30 }
}
```

### 15.2 v3：合规自证 PDF

每月给企业用户生成 PDF：
- 本月生成图总数
- 合规元数据完整率
- 各平台规则通过率
- 法规审计日志摘要

给法务 / 审计用。Enterprise 段刚需。

### 15.3 v3：实时合规预测

用户上传图前（拖到拖拽区悬停时），先做轻量预检（前端 WASM）：
- file_format / dimension / file_size 等无需服务端的快速检查
- 立即标红"这张图大概率过不了 Amazon 白底"

---

## 16. 关联文档

| 主题 | 文档 |
|---|---|
| 数据模型（PlatformRule schema） | [`01-system-design § 3.2`](01-system-design.md) |
| API 契约（合规检查端点） | [`01-system-design § 4.2`](01-system-design.md) |
| Agent 编排（合规检查在 DAG 中的位置） | [`02-agent-orchestration § 7.1`](02-agent-orchestration.md) |
| 开源项目集成（C2PA SDK / RMBG / PaddleOCR / LaMa 等） | [`04-open-source-stack.md`](04-open-source-stack.md) |
| 调研依据（每条规则的来源） | [`docs/research/03-platform-compliance.md`](../research/03-platform-compliance.md) |
