# tests-e2e

End-to-end browser tests for ListPack Studio using Playwright.

## What's covered

- **public.spec.ts** — public pages render without auth: `/`, `/pricing`,
  `/sign-in`, `/sign-up`, `/forgot-password`.
- **auth.spec.ts** — sign-up + sign-in + forgot-password form submission.
- **onboarding-run.spec.ts** — full first-run user journey:
  1. Sign up
  2. Land on `/onboarding`
  3. Walk the wizard (intro → upload → running → done)
  4. Verify SSE step stream rendered
  5. Verify outputs appear on `/dashboard/runs/{id}`

## Running locally

```bash
# One-time
cd tests-e2e
pnpm install
pnpm install:browsers   # downloads Chromium (~150MB)

# Each run — assumes apps/web on :3000 and apps/agent on :8000 are up
pnpm test               # headless
pnpm test:headed        # see the browser
pnpm test:ui            # Playwright UI mode (best for debugging)
```

Set `E2E_AUTO_WEB=1` to make Playwright start `pnpm --filter web dev`
itself. The agent service still needs to be started separately because
its uvicorn worker is independent of the web dev server.

## Pointing at staging / prod

```bash
PLAYWRIGHT_BASE_URL=https://app.listpack.studio pnpm test
```

The agent base URL is whatever the web app proxies to; the E2E tests go
through web's `/api/agent/...` routes so they don't care about the agent
URL directly.

## Why not in CI by default?

The browser binary download (~150 MB) and dev-server spin-up adds 5–8
minutes to every CI run. We instead run Playwright in a separate
scheduled workflow (nightly + pre-release) — see `.github/workflows/`
when wired. The unit + typecheck jobs run on every push and catch the
vast majority of regressions in seconds.
