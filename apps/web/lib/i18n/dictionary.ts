import { cookies } from 'next/headers';
import { en } from './dictionaries/en';
import { zhCN } from './dictionaries/zh-CN';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type Dictionary,
  type Locale,
  isLocale,
} from './types';

const REGISTRY: Record<Locale, Dictionary> = {
  en,
  'zh-CN': zhCN,
};

export function getDictionarySync(locale: Locale): Dictionary {
  return REGISTRY[locale] ?? REGISTRY[DEFAULT_LOCALE];
}

/**
 * Server-side resolver — reads the locale cookie (set by the switcher
 * endpoint) and returns the matching dictionary. Use in `async`
 * Server Components: `const t = await getDictionary();`.
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

/**
 * Tiny template — replaces `{key}` placeholders with `vars[key]`. We
 * skip plural / gender support; the few strings that need them spell out
 * the variants explicitly.
 */
export function fmt(
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`,
  );
}
