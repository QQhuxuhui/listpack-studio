import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for ListPack E2E.
 *
 * Default workflow:
 *   1. Start apps/web on http://localhost:3000 (pnpm dev)
 *   2. Start apps/agent on http://localhost:8000 (uv run uvicorn server:app)
 *   3. From tests-e2e/: `pnpm install && pnpm install:browsers && pnpm test`
 *
 * Override the base URL via PLAYWRIGHT_BASE_URL=https://staging.listpack...
 * to run the same specs against a deployed environment.
 *
 * The `webServer` block spawns the Next dev server automatically when
 * E2E_AUTO_WEB=1 is set — useful for CI. Locally we usually start it
 * manually so the dev server can be reused across reruns.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // sign-up creates DB rows; keep serial to avoid email collisions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.E2E_AUTO_WEB
    ? {
        command: 'pnpm --filter web dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        cwd: '..',
      }
    : undefined,
});
