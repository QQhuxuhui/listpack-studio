/**
 * Stripe webhook handler.
 *
 * Events we care about:
 *   - customer.subscription.created / updated / deleted
 *       → handleSubscriptionChange: sync plan + sku_quota
 *   - invoice.payment_succeeded
 *       → handleInvoicePaymentSucceeded: reset sku_used to 0 + roll
 *         current_period_start/end forward for the new billing window.
 *         Idempotent.
 *   - invoice.payment_failed
 *       → log only (status update arrives via subscription.updated)
 *
 * The route always returns 200 to Stripe once the signature is valid so
 * Stripe doesn't retry on handler-side errors we've already logged.
 */

import Stripe from 'stripe';
import {
  handleInvoicePaymentSucceeded,
  handleSubscriptionChange,
  stripe,
} from '@/lib/payments/stripe';
import { NextRequest, NextResponse } from 'next/server';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET not configured' },
      { status: 503 },
    );
  }

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed.', err);
    return NextResponse.json(
      { error: 'Webhook signature verification failed.' },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        console.warn(
          'invoice.payment_failed for customer',
          (event.data.object as Stripe.Invoice).customer,
        );
        break;

      default:
        // 200 with no-op so Stripe stops resending unknown events.
        console.log(`Unhandled Stripe event: ${event.type}`);
    }
  } catch (err) {
    console.error(`Webhook handler failed (event ${event.type}):`, err);
    // Still ack — bubble up via logs/Sentry rather than make Stripe retry.
  }

  return NextResponse.json({ received: true });
}
