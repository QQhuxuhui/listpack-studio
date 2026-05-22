/**
 * Plan catalog — single source of truth for ListPack pricing tiers.
 *
 * Mirrored from PRD § 00 § 5.1. Keep in sync with:
 *   - `planEnum` in lib/db/schema.ts (DB enum values)
 *   - Stripe product names (case-sensitive; create products in Stripe dashboard
 *     with these exact names so `mapStripeProductToPlan` resolves correctly)
 *   - `apps/agent/runtime/quota.py::PLAN_CATALOG` (quota enforcement)
 *
 * Why a TS catalog (not just Stripe products):
 *   - The Free plan has no Stripe product (no checkout). It still needs a
 *     row in this catalog so the pricing page + UI render it.
 *   - Quota / overage rates need to be queryable WITHOUT a Stripe API call
 *     (every agent run otherwise burns latency on Stripe lookup).
 *   - Stripe prices can drift; the catalog lets us assert "Pro must always
 *     be $49/100 SKU" in tests instead of trusting the Stripe console.
 */

import type { Plan as PlanEnum } from '@/lib/db/schema';

export interface PlanDef {
  /** Matches planEnum in DB schema. */
  id: PlanEnum;
  /** Human-readable name; must match the Stripe product `name` for paid tiers. */
  stripeProductName: string;
  /** Public-facing label (i18n later). */
  displayName: string;
  /** Monthly price in USD cents; 0 for Free, null for Enterprise (custom). */
  monthlyPriceCents: number | null;
  /** SKUs included per month before overage kicks in. */
  skuQuota: number;
  /**
   * USD per SKU once quota exhausted. `null` means overage not allowed
   * (Free) or custom-quoted (Enterprise).
   */
  overagePerSkuUsd: number | null;
  /** Days of paid-trial before card is charged. 0 for Free, 7 for paid tiers. */
  trialDays: number;
  /** Bulleted feature list shown on the pricing page. */
  features: string[];
  /** When true, the tier shows on the public pricing page. */
  publiclyListed: boolean;
  /** PRD § 5.3 refund window (days). */
  refundWindowDays: number;
}

export const PLAN_CATALOG: Record<PlanEnum, PlanDef> = {
  free: {
    id: 'free',
    stripeProductName: 'Free',
    displayName: 'Free',
    monthlyPriceCents: 0,
    skuQuota: 5,
    overagePerSkuUsd: null,
    trialDays: 0,
    features: [
      '每月 5 张图片(含水印)',
      '基础文生图 + 图生图',
      'Gemini 标准画质',
      '无需信用卡',
    ],
    publiclyListed: true,
    refundWindowDays: 0,
  },
  starter: {
    id: 'starter',
    stripeProductName: 'Starter',
    displayName: '入门版',
    monthlyPriceCents: 1900,
    skuQuota: 30,
    overagePerSkuUsd: 0.8,
    trialDays: 7,
    features: [
      '每月 30 张图片,无水印',
      '全部 Gemini 模型',
      '支持参考图/图生图',
      '超额 $0.80/张',
    ],
    publiclyListed: true,
    refundWindowDays: 7,
  },
  pro: {
    id: 'pro',
    stripeProductName: 'Pro',
    displayName: '专业版',
    monthlyPriceCents: 4900,
    skuQuota: 100,
    overagePerSkuUsd: 0.5,
    trialDays: 7,
    features: [
      '每月 100 张图片',
      '解锁 GPT Image 高保真模型',
      '优先生成队列',
      '超额 $0.50/张',
    ],
    publiclyListed: true,
    refundWindowDays: 7,
  },
  brand: {
    id: 'brand',
    stripeProductName: 'Brand',
    displayName: '品牌版',
    monthlyPriceCents: 14900,
    skuQuota: 500,
    overagePerSkuUsd: 0.3,
    trialDays: 7,
    features: [
      '每月 500 张图片',
      '团队 3 席位',
      '历史对话长期保留',
      '超额 $0.30/张',
    ],
    publiclyListed: true,
    refundWindowDays: 14,
  },
  agency: {
    id: 'agency',
    stripeProductName: 'Agency',
    displayName: '代理版',
    monthlyPriceCents: 49900,
    skuQuota: 2500,
    overagePerSkuUsd: 0.2,
    trialDays: 7,
    features: [
      '5 个客户工作区',
      'API 接入 + 白标',
      '每月用量审计报表',
      '超额 $0.20/张',
    ],
    publiclyListed: false, // Sales-led
    refundWindowDays: 14,
  },
  enterprise: {
    id: 'enterprise',
    stripeProductName: 'Enterprise',
    displayName: '企业版',
    monthlyPriceCents: null,
    skuQuota: 0, // Custom-quoted
    overagePerSkuUsd: null,
    trialDays: 0,
    features: [
      '定制配额 + SLA',
      '专属模型/Lora',
      'SSO + 合同年付',
      '内容审核承诺函',
    ],
    publiclyListed: false, // Sales-led
    refundWindowDays: 0,
  },
};

export function publicPlans(): PlanDef[] {
  return Object.values(PLAN_CATALOG).filter((p) => p.publiclyListed);
}

export function getPlan(id: PlanEnum): PlanDef {
  return PLAN_CATALOG[id];
}

/**
 * Resolve a Stripe product name → planEnum. Used by webhook handler when a
 * subscription becomes active / changes plan. Returns null for unknown names
 * so the caller can log + skip the update rather than crash.
 */
export function mapStripeProductToPlan(productName: string): PlanEnum | null {
  for (const plan of Object.values(PLAN_CATALOG)) {
    if (plan.stripeProductName === productName) {
      return plan.id;
    }
  }
  return null;
}
