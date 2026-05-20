/**
 * Real Sentry wrapper — replaces the D47 shim.
 *
 * Initialisation lives in instrumentation.ts (Next 15 convention). This
 * module exposes the same call-site API the rest of the app already
 * uses (`captureException`, `captureMessage`, `setUser`) so D47 callers
 * don't need to change.
 *
 * SENTRY_DSN unset → every export is a no-op + log to the structured
 * logger so events still surface in dev/CI without a Sentry account.
 */

import * as Sentry from '@sentry/nextjs';
import { logger } from './logger';

function sentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentryEnabled()) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error('captureException', { message, stack, ...context });
    return;
  }
  Sentry.captureException(err, {
    extra: context as Record<string, unknown>,
  });
}

export function captureMessage(
  msg: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>,
): void {
  if (!sentryEnabled()) {
    const ours = level === 'warning' ? 'warn' : level;
    logger[ours](`captureMessage: ${msg}`, context);
    return;
  }
  Sentry.captureMessage(msg, {
    level,
    extra: context as Record<string, unknown>,
  });
}

export function setUser(user: { id: string; email?: string } | null): void {
  if (!sentryEnabled()) {
    _currentUser = user;
    return;
  }
  Sentry.setUser(user);
}

let _currentUser: { id: string; email?: string } | null = null;
export function _peekUser() {
  return _currentUser;
}
