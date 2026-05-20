/**
 * Sentry stub — lazy, dependency-free.
 *
 * We don't actually ship the @sentry/nextjs package yet (adds ~3 MB to
 * the bundle and forces edge / server splits to be configured). This
 * module exposes the same `captureException` / `captureMessage` surface
 * so call sites can be wired today and the real SDK swapped in later
 * with a one-file change.
 *
 * Behaviour:
 *   - SENTRY_DSN set + @sentry/nextjs installed → forward to real Sentry
 *     (currently a no-op + dev warning; uncomment the dynamic import
 *     when the dep lands).
 *   - SENTRY_DSN unset → silently log to the structured logger so we
 *     don't lose the event in dev / CI.
 */

import { logger } from './logger';

let initWarningEmitted = false;

function warnInitOnce() {
  if (initWarningEmitted) return;
  initWarningEmitted = true;
  if (!process.env.SENTRY_DSN) {
    logger.debug('sentry: SENTRY_DSN unset; falling back to logger only');
  } else {
    logger.warn(
      'sentry: SENTRY_DSN set but @sentry/nextjs not installed — install + replace shim',
    );
  }
}

export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  warnInitOnce();
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error('captureException', { message, stack, ...context });
}

export function captureMessage(
  msg: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>,
): void {
  warnInitOnce();
  const ours = level === 'warning' ? 'warn' : level;
  logger[ours](`captureMessage: ${msg}`, context);
}

export function setUser(user: { id: string; email?: string } | null): void {
  // Real SDK: Sentry.setUser(user). Here we just track in a module variable
  // so future logger.child() calls could pick it up.
  warnInitOnce();
  _currentUser = user;
}

let _currentUser: { id: string; email?: string } | null = null;
export function _peekUser() {
  return _currentUser;
}
