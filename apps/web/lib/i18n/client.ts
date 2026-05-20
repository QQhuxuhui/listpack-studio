'use client';

/**
 * Client-side dictionary access.
 *
 * Server components call `getDictionary()` (async, reads cookie via
 * next/headers). Client components call this `useDictionary()` hook,
 * which reads the same cookie via `document.cookie` and returns the
 * matching dictionary synchronously.
 *
 * Note: components mount with DEFAULT_LOCALE for the very first render
 * (the cookie isn't readable until after hydration). For most copy this
 * is invisible because SSR already painted the correct strings; only
 * components that re-render purely client-side will briefly flash. If
 * we ever care, swap to passing the locale down via a Provider seeded
 * from a server component.
 */

import { useEffect, useState } from 'react';
import { getDictionarySync } from './dictionary';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  type Dictionary,
  type Locale,
} from './types';

function readLocaleCookie(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
  const raw = match?.split('=')[1];
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

export function useDictionary(): { locale: Locale; t: Dictionary } {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    setLocale(readLocaleCookie());
  }, []);
  return { locale, t: getDictionarySync(locale) };
}
