/**
 * Next.js 15 instrumentation hook — runs once per server process.
 *
 * We initialise Sentry here so the SDK is ready before any request
 * handler. The dynamic import in each branch lets Next tree-shake the
 * Edge runtime build (where some Sentry modules aren't supported).
 *
 * Required env to actually send events:
 *   SENTRY_DSN              — project DSN
 *   SENTRY_ENVIRONMENT      — e.g. "production" / "staging" (default: NODE_ENV)
 *   SENTRY_TRACES_SAMPLE_RATE — float 0..1 (default 0.1)
 */

export async function register() {
  if (!process.env.SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      // Don't auto-capture console.log noise — we have structured logger.
      integrations: (existing) =>
        existing.filter((i) => i.name !== 'Console'),
    });
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    });
  }
}

// Re-export Sentry's captureRequestError so Next.js wires it as the
// onRequestError hook. @sentry/nextjs already has the right signature
// for the framework's `Request` shape; redefining it here drifts the
// types as the SDK evolves.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
