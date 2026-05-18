import { db } from './drizzle';
import {
  members,
  subscriptions,
  users,
  workspaces,
  type NewMember,
  type NewSubscription,
  type NewUser,
  type NewWorkspace,
} from './schema';
import { hashPassword } from '@/lib/auth/session';
import { stripe } from '@/lib/payments/stripe';

async function createStripeProducts() {
  console.log('Creating Stripe products and prices...');

  const pro = await stripe.products.create({
    name: 'Pro',
    description: 'ListPack Pro — 100 SKU / month',
  });

  await stripe.prices.create({
    product: pro.id,
    unit_amount: 4900,
    currency: 'usd',
    recurring: { interval: 'month', trial_period_days: 7 },
  });

  const brand = await stripe.products.create({
    name: 'Brand',
    description: 'ListPack Brand — 500 SKU / month + Brand Kit',
  });

  await stripe.prices.create({
    product: brand.id,
    unit_amount: 14900,
    currency: 'usd',
    recurring: { interval: 'month', trial_period_days: 14 },
  });

  console.log('Stripe products and prices created.');
}

async function seed() {
  const email = 'test@test.com';
  const password = 'admin123';
  const passwordHash = await hashPassword(password);

  const newUser: NewUser = { email, name: 'Test User', passwordHash };
  const [user] = await db.insert(users).values(newUser).returning();
  if (!user) throw new Error('Failed to seed user');
  console.log(`User created: ${email}`);

  const newWorkspace: NewWorkspace = {
    slug: 'test-workspace',
    name: 'Test Workspace',
    ownerUserId: user.id,
    planId: 'pro',
  };
  const [workspace] = await db.insert(workspaces).values(newWorkspace).returning();
  if (!workspace) throw new Error('Failed to seed workspace');
  console.log(`Workspace created: ${workspace.slug}`);

  const newMember: NewMember = {
    userId: user.id,
    workspaceId: workspace.id,
    role: 'owner',
  };
  await db.insert(members).values(newMember);

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const newSub: NewSubscription = {
    workspaceId: workspace.id,
    plan: 'pro',
    status: 'active',
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    skuQuota: 100,
    skuUsed: 0,
  };
  await db.insert(subscriptions).values(newSub);

  if (process.env.STRIPE_SECRET_KEY) {
    await createStripeProducts();
  } else {
    console.log('STRIPE_SECRET_KEY not set — skipping Stripe product seeding.');
  }
}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });
