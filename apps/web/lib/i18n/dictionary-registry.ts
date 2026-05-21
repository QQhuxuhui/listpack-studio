/**
 * Pure dictionary registry — safe to import from client OR server.
 *
 * IMPORTANT: this module MUST NOT import any `next/headers`,
 * `server-only`, or anything that touches request-bound APIs. The
 * server-side cookie reader lives in `./dictionary.ts`; the client
 * cookie reader lives in `./client.ts`. Both import the registry from
 * here so they share the same dictionary instances without pulling
 * server-only modules into the client bundle.
 *
 * Why split: a single `dictionary.ts` that imports `next/headers`
 * leaks into any client module that needs `getDictionarySync` (e.g.
 * `lib/i18n/client.ts`'s useDictionary hook), breaking
 * `next build` with "You're importing a component that needs
 * next/headers" — exactly the D58.2 review finding.
 */

import { en } from './dictionaries/en';
import { zhCN } from './dictionaries/zh-CN';
import {
  DEFAULT_LOCALE,
  type Dictionary,
  type Locale,
} from './types';

export const REGISTRY: Record<Locale, Dictionary> = {
  en,
  'zh-CN': zhCN,
};

export function getDictionarySync(locale: Locale): Dictionary {
  return REGISTRY[locale] ?? REGISTRY[DEFAULT_LOCALE];
}

/**
 * Tiny template — replaces `{key}` placeholders with `vars[key]`. We
 * skip plural / gender support; the few strings that need them spell
 * out the variants explicitly.
 *
 * Lives in the registry (not dictionary.ts) so client code can call
 * fmt() without dragging server-only deps in.
 */
export function fmt(
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`,
  );
}
