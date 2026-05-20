import { expect, test } from '@playwright/test';

/**
 * Public pages — no auth required. These cover the "did anything obvious
 * break" surface and are the cheapest check to keep green.
 */

test('landing renders hero + plan teaser + CTA', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /one photo in/i }),
  ).toBeVisible();
  // Plan teaser cards (Free / Starter / Pro / Brand)
  await expect(page.getByText('Free', { exact: true })).toBeVisible();
  await expect(page.getByText('Pro', { exact: true })).toBeVisible();
  // CTA to sign-up
  await expect(
    page.getByRole('link', { name: /start free/i }).first(),
  ).toBeVisible();
});

test('pricing page lists all 4 public tiers', async ({ page }) => {
  await page.goto('/pricing');
  for (const tier of ['Free', 'Starter', 'Pro', 'Brand']) {
    await expect(page.getByRole('heading', { name: tier })).toBeVisible();
  }
});

test('sign-in form shows email + password + forgot-password link', async ({
  page,
}) => {
  await page.goto('/sign-in');
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(
    page.getByRole('link', { name: /forgot password/i }),
  ).toBeVisible();
});

test('forgot-password form submits and shows generic success', async ({
  page,
}) => {
  await page.goto('/forgot-password');
  await page.getByLabel(/email/i).fill('does-not-exist@example.com');
  await page.getByRole('button', { name: /send reset link/i }).click();
  // Account-enumeration guard: success message is the same regardless of
  // whether the email exists in the DB.
  await expect(page.getByText(/we just sent a reset link/i)).toBeVisible();
});
