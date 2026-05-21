/**
 * Server-side dictionary resolver.
 *
 * Importing this file pulls in `next/headers`, so it is SAFE ONLY in
 * Server Components, route handlers, and server actions. Client
 * components must import from `./client` (the useDictionary hook) or
 * directly from `./dictionary-registry` (raw getDictionarySync + fmt).
 *
 * The runtime `import 'server-only'` line below makes Next throw a
 * clear build-time error if a client file ever tries to import this
 * module — prevents the D58.2 regression sneaking back in.
 */

import 'server-only';
import { cookies } from 'next/headers';

import {
  REGISTRY,
  getDictionarySync,
  fmt,
} from './dictionary-registry';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type Dictionary,
  type Locale,
  isLocale,
} from './types';

/**
 * Server-side resolver — reads the locale cookie (set by the switcher
 * endpoint) and returns the matching dictionary. Use in `async`
 * Server Components: `const { t } = await getDictionary();`.
 */
export async function getDictionary(): Promise<{
  locale: Locale;
  t: Dictionary;
}> {
  const cookieJar = await cookies();
  const fromCookie = cookieJar.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
  return { locale, t: REGISTRY[locale] };
}

// Re-export the pure registry helpers for back-compat with existing
// server-side imports (`import { fmt, getDictionarySync } from
// '@/lib/i18n/dictionary'`). Client code should switch to importing
// from './dictionary-registry' directly to avoid the server bundle.
export { getDictionarySync, fmt };
