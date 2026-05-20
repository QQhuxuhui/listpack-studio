/**
 * Category guardrails — single source of truth for PRD § 00 § 3.3
 * "红线品类（明确不做）".
 *
 * PRD says we explicitly DON'T do:
 *   - 保健品 (supplements / pet_supplements) — FDA / FTC liability for
 *     unsubstantiated health claims is the #1 ban risk
 *   - 医美 (medical / medical_aesthetic) — Class II/III device labelling
 *     rules; generated marketing is literally illegal in most markets
 *   - 珠宝 (jewelry) — auth-grade photography demanded by Amazon,
 *     AI-generated metallic surfaces routinely fail review
 *   - 食品 (food) — FDA Section 403; "natural/organic" claims trigger
 *     immediate audit
 *
 * The agent also has these categories seeded in `compliance/rules/categories.py`
 * (warn-level). The UI must additionally REFUSE to start a run for the
 * blocked set, not just warn. Reason: blocking generation is far cheaper
 * than handling the chargeback when Amazon rejects the listing AND the
 * customer disputes the SKU charge.
 *
 * Keep this file in sync with apps/agent/compliance/rules/categories.py.
 */

export type CategoryRisk = 'supported' | 'caution' | 'blocked';

export interface CategoryDef {
  id: string;
  /** What the user sees in the dropdown. */
  displayName: string;
  /** Brief one-line description used in tooltips / radio descriptions. */
  description: string;
  risk: CategoryRisk;
  /** When risk='caution'|'blocked', why — used as the warning copy. */
  reason?: string;
}

export const CATEGORIES: CategoryDef[] = [
  // ── safe / PRD § 00 § 4.1 P1 v1 品类规则 ─────────────────────
  {
    id: 'apparel',
    displayName: 'Apparel',
    description: 'Clothing, shoes, bags, fashion accessories',
    risk: 'supported',
  },
  {
    id: 'home_goods',
    displayName: 'Home goods',
    description: 'Furniture, kitchenware, decor, soft goods',
    risk: 'supported',
  },
  {
    id: 'electronics',
    displayName: 'Electronics (3C)',
    description: 'Consumer electronics, phone accessories, audio',
    risk: 'supported',
  },
  {
    id: 'accessories',
    displayName: 'Accessories',
    description: 'Watches, bags, belts (non-precious-metal)',
    risk: 'supported',
  },

  // ── caution: allowed but warned ─────────────────────────────
  {
    id: 'kids_toys',
    displayName: "Kids' toys",
    description: 'Toys / games for under-12s',
    risk: 'caution',
    reason:
      "Toys for under-12s are subject to CPSIA labelling; generated marketing must NEVER imply choking-hazard-free or non-toxic without lab proof. We'll add stricter checks but the listing may still need manual legal review.",
  },

  // ── blocked: PRD § 00 § 3.3 红线品类 ─────────────────────────
  {
    id: 'supplements',
    displayName: 'Supplements',
    description: 'Vitamins, sports nutrition, herbal',
    risk: 'blocked',
    reason:
      'Supplements (FDA dietary supplement category) carry strict no-medical-claim rules. AI-generated marketing routinely trips the FDA structure/function-claim line. We do not generate listings for this category in v1 — please use a specialist tool.',
  },
  {
    id: 'pet_supplements',
    displayName: 'Pet supplements',
    description: 'Pet vitamins, joint care, oral health',
    risk: 'blocked',
    reason:
      'Pet supplements fall under the same FDA / FTC scrutiny as human supplements. Blocked in v1.',
  },
  {
    id: 'medical',
    displayName: 'Medical devices',
    description: 'OTC medical, diagnostic, mobility aids',
    risk: 'blocked',
    reason:
      'Class II / III medical devices require FDA-approved labelling. AI-generated copy cannot be used per 21 CFR § 801. Blocked in v1.',
  },
  {
    id: 'medical_aesthetic',
    displayName: 'Medical aesthetic',
    description: 'Aesthetic devices, anti-aging claims',
    risk: 'blocked',
    reason:
      'Medical aesthetic devices are regulated as Class II in EU/CN/US. Blocked in v1.',
  },
  {
    id: 'food',
    displayName: 'Food',
    description: 'Snacks, beverages, packaged groceries',
    risk: 'blocked',
    reason:
      'Food labelling (FDA Section 403) requires precise nutrition + origin claims. "Natural / organic" wording triggers immediate audit. Blocked in v1.',
  },
  {
    id: 'jewelry',
    displayName: 'Jewelry (precious)',
    description: 'Gold / silver / diamonds / gemstones',
    risk: 'blocked',
    reason:
      'Authentic gemstone / precious-metal photography is auth-required on every major marketplace. AI-generated metallic surfaces fail review > 90% of the time. Blocked in v1.',
  },
];

const BY_ID: Record<string, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

export function getCategory(id: string | null | undefined): CategoryDef | null {
  if (!id) return null;
  return BY_ID[id] ?? null;
}

/** True if the run should be allowed to start. */
export function isCategoryRunnable(id: string | null | undefined): boolean {
  if (!id) return true; // No category selected → don't enforce yet.
  const cat = getCategory(id);
  if (!cat) return true; // Unknown id → treat as unrestricted (defensive).
  return cat.risk !== 'blocked';
}

/** Categories shown in the picker (all of them, grouped by risk). */
export function publicCategories(): CategoryDef[] {
  return [...CATEGORIES];
}
