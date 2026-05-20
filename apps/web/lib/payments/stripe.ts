import Stripe from 'stripe';
import { redirect } from 'next/navigation';
import {
  getSubscriptionByStripeCustomerId,
  getUser,
  updateSubscription,
} from '@/lib/db/queries';
import type { Plan, WorkspaceWithMembers } from '@/lib/db/schema';
import { mapStripeProductToPlan, getPlan } from './plans';

/**
 * Lazy Stripe client.
 *
 * Stripe SDK v18 throws on construction when `apiKey` is falsy, which breaks
 * any module that imports this file before Stripe is wired up (seed scripts,
 * Phase 2 builds, etc). We defer construction until the first method call.
 */
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        'STRIPE_SECRET_KEY is not set. Required only when invoking Stripe (checkout / webhook / seed).',
      );
    }
    _stripe = new Stripe(key, { apiVersion: '2025-08-27.basil' });
  }
  return _stripe;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_t, prop, recv) {
    return Reflect.get(getStripe() as unknown as object, prop, recv);
  },
});

export async function createCheckoutSession({
  workspace,
  priceId,
}: {
  workspace: WorkspaceWithMembers | null;
  priceId: string;
}) {
  const user = await getUser();

  if (!workspace || !user) {
    redirect(`/sign-up?redirect=checkout&priceId=${priceId}`);
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/pricing`,
    customer: workspace.subscription?.stripeCustomerId ?? undefined,
    client_reference_id: user.id,
    allow_promotion_codes: true,
    subscription_data: {
      // ListPack uses 7-day refund (Starter/Pro) per PRD 00 § 5.3.
      // Stripe trial is set here mainly so users without payment method aren't
      // charged before they explore. Adjust per plan when Brand/Agency added.
      trial_period_days: 7,
    },
  });

  redirect(session.url!);
}

export async function createCustomerPortalSession(
  workspace: WorkspaceWithMembers,
) {
  const sub = workspace.subscription;
  if (!sub?.stripeCustomerId || !sub.stripeProductId) {
    redirect('/pricing');
  }

  let configuration: Stripe.BillingPortal.Configuration;
  const configurations = await stripe.billingPortal.configurations.list();

  if (configurations.data.length > 0) {
    configuration = configurations.data[0]!;
  } else {
    const product = await stripe.products.retrieve(sub.stripeProductId);
    if (!product.active) {
      throw new Error("Workspace's product is not active in Stripe");
    }

    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
    });
    if (prices.data.length === 0) {
      throw new Error("No active prices found for the workspace's product");
    }

    configuration = await stripe.billingPortal.configurations.create({
      business_profile: { headline: 'Manage your subscription' },
      features: {
        subscription_update: {
          enabled: true,
          default_allowed_updates: ['price', 'quantity', 'promotion_code'],
          proration_behavior: 'create_prorations',
          products: [
            {
              product: product.id,
              prices: prices.data.map((p) => p.id),
            },
          ],
        },
        subscription_cancel: {
          enabled: true,
          mode: 'at_period_end',
          cancellation_reason: {
            enabled: true,
            options: [
              'too_expensive',
              'missing_features',
              'switched_service',
              'unused',
              'other',
            ],
          },
        },
        payment_method_update: { enabled: true },
      },
    });
  }

  return stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${process.env.BASE_URL}/dashboard`,
    configuration: configuration.id,
  });
}

export async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
) {
  const customerId = subscription.customer as string;
  const sub = await getSubscriptionByStripeCustomerId(customerId);

  if (!sub) {
    console.error('Subscription not found for Stripe customer:', customerId);
    return;
  }

  if (subscription.status === 'active' || subscription.status === 'trialing') {
    const item = subscription.items.data[0];
    const product = item?.price?.product as Stripe.Product | undefined;
    const productId = product?.id;

    // Map Stripe product name → plan enum + sku_quota. Falls back to the
    // current plan if the product name doesn't match the catalog (e.g. a
    // promo product created out-of-band) so we never accidentally
    // downgrade a paying customer to 'free'.
    let plan: Plan | undefined;
    if (product?.name) {
      const mapped = mapStripeProductToPlan(product.name);
      if (mapped) {
        plan = mapped;
      } else {
        console.warn(
          `Stripe product "${product.name}" not in PLAN_CATALOG; ` +
            `keeping plan=${sub.plan} for subscription ${sub.id}`,
        );
      }
    }

    const update: Partial<Parameters<typeof updateSubscription>[1]> = {
      stripeSubscriptionId: subscription.id,
      stripeProductId: productId ?? null,
      status: subscription.status,
    };
    if (plan) {
      update.plan = plan;
      update.skuQuota = getPlan(plan).skuQuota;
    }
    await updateSubscription(sub.id, update);
  } else if (
    subscription.status === 'canceled' ||
    subscription.status === 'unpaid'
  ) {
    // Don't reset sku_used here — the user might re-subscribe before period
    // end and we want to preserve their usage history.
    await updateSubscription(sub.id, {
      stripeSubscriptionId: null,
      stripeProductId: null,
      status: subscription.status,
      // Drop them back to Free quota so future runs hit the gate.
      plan: 'free',
      skuQuota: getPlan('free').skuQuota,
    });
  }
}

/**
 * Resets sku_used to 0 and rolls forward the billing window. Triggered by
 * Stripe's `invoice.payment_succeeded` webhook at the start of each new
 * monthly period.
 *
 * Idempotent — safe to call twice; the second call just sets the same
 * period_start/period_end values.
 */
export async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
) {
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) {
    console.warn('invoice.payment_succeeded without customer id; skipping');
    return;
  }
  const sub = await getSubscriptionByStripeCustomerId(customerId);
  if (!sub) {
    console.error(
      `invoice.payment_succeeded: no subscription for customer ${customerId}`,
    );
    return;
  }

  // Stripe SDK v18 moved period boundaries onto invoice.lines.data[].period.
  const line = invoice.lines?.data?.[0];
  const periodStart = line?.period?.start
    ? new Date(line.period.start * 1000)
    : new Date();
  const periodEnd = line?.period?.end
    ? new Date(line.period.end * 1000)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await updateSubscription(sub.id, {
    skuUsed: 0,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  });
}

export async function getStripePrices() {
  const prices = await stripe.prices.list({
    expand: ['data.product'],
    active: true,
    type: 'recurring',
  });

  return prices.data.map((price) => ({
    id: price.id,
    productId:
      typeof price.product === 'string' ? price.product : price.product.id,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval,
    trialPeriodDays: price.recurring?.trial_period_days,
  }));
}

export async function getStripeProducts() {
  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price'],
  });

  return products.data.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    defaultPriceId:
      typeof product.default_price === 'string'
        ? product.default_price
        : product.default_price?.id,
  }));
}
