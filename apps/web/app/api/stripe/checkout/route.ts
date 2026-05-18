import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db/drizzle';
import { members, subscriptions, users } from '@/lib/db/schema';
import { setSession } from '@/lib/auth/session';
import { stripe } from '@/lib/payments/stripe';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.redirect(new URL('/pricing', request.url));
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription'],
    });

    if (!session.customer || typeof session.customer === 'string') {
      throw new Error('Invalid customer data from Stripe.');
    }

    const customerId = session.customer.id;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) {
      throw new Error('No subscription found for this session.');
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });

    const item = subscription.items.data[0];
    const plan = item?.price;
    if (!plan) throw new Error('No plan found for this subscription.');

    const productId = (plan.product as Stripe.Product).id;
    if (!productId) {
      throw new Error('No product ID found for this subscription.');
    }

    const userId = session.client_reference_id;
    if (!userId) {
      throw new Error("No user ID found in session's client_reference_id.");
    }

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userRows[0];
    if (!user) throw new Error('User not found in database.');

    const memberRows = await db
      .select({ workspaceId: members.workspaceId })
      .from(members)
      .where(eq(members.userId, user.id))
      .limit(1);

    const member = memberRows[0];
    if (!member) {
      throw new Error('User is not associated with any workspace.');
    }

    // Stripe SDK v18 moved current_period_start/end onto subscription items.
    // Fall back to "now → +30d" when the item lookup fails.
    const subItem = subscription.items.data[0] as
      | (Stripe.SubscriptionItem & {
          current_period_start?: number;
          current_period_end?: number;
        })
      | undefined;
    const periodStart = subItem?.current_period_start
      ? new Date(subItem.current_period_start * 1000)
      : new Date();
    const periodEnd = subItem?.current_period_end
      ? new Date(subItem.current_period_end * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db
      .insert(subscriptions)
      .values({
        workspaceId: member.workspaceId,
        plan: 'free', // overridden by webhook once we map productId→plan
        status: subscription.status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripeProductId: productId,
      })
      .onConflictDoUpdate({
        target: subscriptions.workspaceId,
        set: {
          status: subscription.status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripeProductId: productId,
          updatedAt: new Date(),
        },
      });

    await setSession(user);
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('Error handling successful checkout:', error);
    return NextResponse.redirect(new URL('/error', request.url));
  }
}
