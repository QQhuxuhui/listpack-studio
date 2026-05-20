import { expect, test } from '@playwright/test';
import path from 'node:path';

/**
 * Critical-path test: a brand-new user signs up, completes the
 * onboarding wizard with a sample product image, and reaches the
 * run-detail page with at least one persisted output.
 *
 * Requires the agent service to be reachable from the web app
 * (AGENT_SERVICE_URL env on the web side). If the agent isn't up,
 * the wizard will still render but the SSE stream will fail —
 * this test asserts the happy path.
 */

const SAMPLE_IMAGE = path.resolve(
  __dirname,
  '../fixtures/sample-product.jpg',
);

test('new-user end-to-end: sign-up → onboarding → run → outputs', async ({
  page,
}, testInfo) => {
  // Unique email per test so reruns don't collide on the unique constraint.
  const email = `e2e-${Date.now()}-${testInfo.workerIndex}@example.com`;
  const password = 'TestPassword123!';

  // 1. Sign-up
  await page.goto('/sign-up');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole('button', { name: /sign up/i }).click();

  // 2. Land on /onboarding
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText(/Welcome/i)).toBeVisible();

  // 3. Step into upload
  await page.getByRole('button', { name: /start with one photo/i }).click();
  await expect(
    page.getByRole('heading', { name: /upload your first product photo/i }),
  ).toBeVisible();

  // 4. Upload + run
  await page.setInputFiles('#onb-file', SAMPLE_IMAGE);
  // 'amazon' chip is on by default; just hit submit.
  await page.getByRole('button', { name: /run the agent/i }).click();

  // 5. Watch SSE — wait for at least one step to land.
  await expect(page.getByText(/Agent is working/i)).toBeVisible();
  await expect(
    page.locator('li:has-text("plan")').first(),
  ).toBeVisible({ timeout: 120_000 });

  // 6. Wait for the terminal "done" panel and follow the View outputs link.
  await expect(page.getByRole('heading', { name: /your first pack/i })).toBeVisible({
    timeout: 180_000,
  });

  await page.getByRole('link', { name: /view outputs/i }).click();

  // 7. Run-detail page shows at least one stamped output thumbnail.
  await expect(page).toHaveURL(/\/dashboard\/runs\/[a-z0-9-]+/);
  await expect(
    page.locator('img[alt*="amazon"], img[alt*=".main"]').first(),
  ).toBeVisible({ timeout: 30_000 });
});
