/**
 * Pure dictionary registry — safe to import from client OR server.
 *
 * MUST NOT import `next/headers` or `server-only`. The server cookie
 * reader is in `./dictionary.ts`; the client one is in `./client.ts`.
 * Both import this registry so they share dictionary instances without
 * dragging server-only modules into the client bundle.
 */

import { zhCN } from './dictionaries/zh-CN';
import {
  DEFAULT_LOCALE,
  type Dictionary,
  type Locale,
} from './types';

export const REGISTRY: Record<Locale, Dictionary> = {
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
