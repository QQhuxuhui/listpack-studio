import { checkoutAction } from '@/lib/payments/actions';
import { Check } from 'lucide-react';
import { getStripePrices, getStripeProducts } from '@/lib/payments/stripe';
import { publicPlans, type PlanDef } from '@/lib/payments/plans';
import { getDictionary, fmt } from '@/lib/i18n/dictionary';
import type { Dictionary } from '@/lib/i18n/types';
import { SubmitButton } from './submit-button';

// Prices are fresh for one hour max
export const revalidate = 3600;

interface PricedPlan extends PlanDef {
  stripePriceId?: string;
}

export default async function PricingPage() {
  const { t } = await getDictionary();
  const stripePriceByProductName = new Map<string, string>();

  try {
    const [prices, products] = await Promise.all([
      getStripePrices(),
      getStripeProducts(),
    ]);
    for (const product of products) {
      const price = prices.find((p) => p.productId === product.id);
      if (price?.id) {
        stripePriceByProductName.set(product.name, price.id);
      }
    }
  } catch {
    // Stripe unavailable (e.g. STRIPE_SECRET_KEY unset in dev) — render the
    // catalog without checkout buttons.
  }

  const plans: PricedPlan[] = publicPlans().map((plan) => ({
    ...plan,
    stripePriceId: stripePriceByProductName.get(plan.stripeProductName),
  }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-semibold text-gray-900 mb-3">{t.pricing.h1}</h1>
        <p className="text-gray-600 max-w-2xl mx-auto">{t.pricing.sub}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 max-w-7xl mx-auto">
        {plans.map((plan) => (
          <PricingCard key={plan.id} plan={plan} t={t} />
        ))}
      </div>

      <p className="text-center text-sm text-gray-500 mt-12">
        {t.pricing.sales_footer_a}{' '}
        <a href="/contact" className="underline">
          {t.common.talk_to_sales}
        </a>{' '}
        {t.pricing.sales_footer_b}
      </p>
    </main>
  );
}

function PricingCard({ plan, t }: { plan: PricedPlan; t: Dictionary }) {
  const isFree = plan.monthlyPriceCents === 0;
  const isPro = plan.id === 'pro';

  return (
    <div
      className={`flex flex-col rounded-lg border bg-white p-6 ${
        isPro
          ? 'border-orange-400 ring-2 ring-orange-100 relative'
          : 'border-gray-200'
      }`}
    >
      {isPro && (
        <span className="absolute -top-3 right-4 bg-orange-500 text-white text-xs font-semibold px-2 py-1 rounded-full">
          {t.common.most_popular}
        </span>
      )}
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        {plan.displayName}
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        {isFree
          ? t.pricing.no_card
          : fmt(t.pricing.trial_days, { n: plan.trialDays })}
      </p>
      <p className="text-4xl font-semibold text-gray-900 mb-1">
        {plan.monthlyPriceCents !== null
          ? `$${plan.monthlyPriceCents / 100}`
          : '定制'}
        {plan.monthlyPriceCents !== null && (
          <span className="text-sm font-normal text-gray-600 ml-1">/ 月</span>
        )}
      </p>
      <p className="text-sm text-gray-600 mb-6">
        {fmt(t.pricing.includes_skus, { n: plan.skuQuota })}
        {plan.overagePerSkuUsd !== null
          ? fmt(t.pricing.overage_rate, { rate: plan.overagePerSkuUsd })
          : t.pricing.no_overage}
      </p>
      <ul className="space-y-3 mb-8 flex-1">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start text-sm text-gray-700">
            <Check className="h-4 w-4 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {isFree ? (
        <a
          href="/sign-up"
          className="block text-center px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
        >
          {t.pricing.start_free}
        </a>
      ) : plan.stripePriceId ? (
        <form action={checkoutAction}>
          <input type="hidden" name="priceId" value={plan.stripePriceId} />
          <SubmitButton />
        </form>
      ) : (
        <p className="text-xs text-gray-500 text-center">
          {t.pricing.setup_in_progress}
        </p>
      )}
    </div>
  );
}
