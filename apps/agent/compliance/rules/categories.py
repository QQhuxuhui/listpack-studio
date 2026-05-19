"""Category-scoped rules — apply across platforms, gated by Asset.category.

D7 ships the highest-risk text-overlay phrases for 4 regulated categories.
D9 expands these to the full red-line lists from PRD § 03 § 8 and adds
required-element checks (e.g. CPSIA warning text for kids' toys).
"""

from __future__ import annotations

from ..schemas import RuleSeverity, RuleSpec

# Keywords are lowercase substring matches by default. Mix EN/ZH so the same
# spec handles cross-border sellers shipping both audiences from one SKU.

SUPPLEMENT_FORBIDDEN_TEXT = [
    # Medical effect claims (FDA / Amazon Section 3 high risk)
    "cure", "cures", "treat", "treats", "treatment",
    "heal", "heals", "healing",
    "prevent", "prevents",
    "diagnose", "diagnosis",
    # Common ZH equivalents
    "治愈", "治疗", "防止", "诊断",
    # Common before/after weight-loss claims
    "weight loss", "lose weight", "减肥", "瘦身",
]

COSMETICS_FORBIDDEN_TEXT = [
    "wrinkle reduction", "anti-wrinkle",
    "acne treatment", "anti-acne",
    "skin whitening", "skin lightening",
    "去皱", "祛痘", "美白功效", "淡斑",
]

FOOD_UNSUBSTANTIATED_TEXT = [
    "100% natural",
    "100% organic",
    "全天然", "纯天然", "100% 有机", "有机认证",
    # "natural" / "organic" alone are intentionally NOT here — too many
    # legitimate uses. Operators add them via custom rules per market.
]


RULES: list[RuleSpec] = [
    RuleSpec(
        rule_key="category.supplements.no_medical_claims",
        platform="global",
        applies_to_slot="any",
        applies_to_category=["supplements"],
        detector_type="category_forbidden_text",
        spec={"keywords": SUPPLEMENT_FORBIDDEN_TEXT, "min_confidence": 0.6},
        severity=RuleSeverity.block,
        display_title={
            "en": "Supplement image contains medical claims",
            "zh": "保健品图含医疗效果暗示",
        },
        display_message={
            "en": "Supplement images must not imply medical efficacy "
            "(cure / treat / heal / weight-loss claims). Amazon Section 3 high-risk; "
            "FDA enforcement region.",
            "zh": "保健品图禁止医疗效果暗示词；Amazon Section 3 高风险，"
            "美国 FDA 重点监管。",
        },
        source_url="https://www.bellavix.com/amazons-rules-for-supplement-images-and-prohibited-terms-explained/",
    ),
    RuleSpec(
        rule_key="category.cosmetics.no_disease_claims",
        platform="global",
        applies_to_slot="any",
        applies_to_category=["cosmetics"],
        detector_type="category_forbidden_text",
        spec={"keywords": COSMETICS_FORBIDDEN_TEXT, "min_confidence": 0.6},
        severity=RuleSeverity.block,
        display_title={
            "en": "Cosmetic image contains disease-treatment claims",
            "zh": "化妆品图含疾病治疗暗示",
        },
        display_message={
            "en": "Phrases like 'wrinkle reduction' or 'acne treatment' classify the "
            "product as a drug under FDA rules. Use cosmetic-safe language.",
            "zh": "「去皱」「祛痘」等用语会让产品被 FDA 归类为药品。请用安全话术。",
        },
        source_url="https://www.fda.gov/cosmetics/cosmetics-laws-regulations",
    ),
    RuleSpec(
        rule_key="category.food.organic_natural_unsubstantiated",
        platform="global",
        applies_to_slot="any",
        applies_to_category=["food"],
        detector_type="category_forbidden_text",
        spec={"keywords": FOOD_UNSUBSTANTIATED_TEXT, "min_confidence": 0.6},
        severity=RuleSeverity.warn,
        display_title={
            "en": "Unsubstantiated organic / natural claim",
            "zh": "未经认证的 organic / 天然 宣称",
        },
        display_message={
            "en": "Claims like '100% organic' / '100% natural' require certification "
            "evidence. Without it, this risks consumer-protection action.",
            "zh": "「100% 有机」「纯天然」类宣称需要认证证据；否则面临消费者保护机构追究。",
        },
        source_url="https://www.fda.gov/food/food-labeling-nutrition",
    ),

    # ── Kids' toys (CPSIA) ────────────────────────────────────────
    RuleSpec(
        rule_key="category.kids_toys.no_choking_hazard_implications",
        platform="global",
        applies_to_slot="any",
        applies_to_category=["kids_toys"],
        detector_type="category_forbidden_text",
        spec={
            "keywords": [
                # Phrases that imply suitability for infants when product isn't tested
                "newborn safe", "baby safe", "infant friendly",
                "婴儿安全", "新生儿适用",
            ],
            "min_confidence": 0.6,
        },
        severity=RuleSeverity.block,
        display_title={
            "en": "Infant-safety claim without certification",
            "zh": "未经认证的婴幼儿安全声明",
        },
        display_message={
            "en": "CPSIA forbids unqualified infant-safety claims. Use age-graded "
            "language matched to your test report (e.g. 'Ages 3+').",
            "zh": "CPSIA 禁止未经测试的婴幼儿安全声明; 请用与测试报告一致的年龄分级 "
            "用语 (如「适用 3 岁以上」)。",
        },
        source_url="https://www.cpsc.gov/Business--Manufacturing/Business-Education/childrens-products",
    ),

    # ── Pet supplements ────────────────────────────────────────────
    RuleSpec(
        rule_key="category.pet_supplements.no_medical_claims",
        platform="global",
        applies_to_slot="any",
        applies_to_category=["pet_supplements"],
        detector_type="category_forbidden_text",
        spec={
            "keywords": [
                "cure", "treats joint pain", "treats arthritis",
                "treats anxiety", "treats allergy",
                "治疗关节炎", "治疗焦虑",
            ],
            "min_confidence": 0.6,
        },
        severity=RuleSeverity.block,
        display_title={
            "en": "Pet supplement implies medical efficacy",
            "zh": "宠物保健品图含医疗效果暗示",
        },
        display_message={
            "en": "FDA classifies pet products with medical claims as veterinary "
            "drugs, requiring approval. Use wellness language only.",
            "zh": "宠物用品图若含医疗效果暗示, FDA 视为兽药需要审批; 请用保健话术。",
        },
        source_url="https://www.fda.gov/animal-veterinary/animal-health-literacy",
    ),
]
