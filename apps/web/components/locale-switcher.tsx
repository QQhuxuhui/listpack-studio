'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from '@/lib/i18n/types';

interface Props {
  /** Optional override from a parent that knows SSR locale. */
  currentLocale?: Locale;
}

const LABEL: Record<Locale, string> = {
  en: 'EN',
  'zh-CN': '中',
};

function readLocaleCookie(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
  const raw = match?.split('=')[1];
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

export function LocaleSwitcher({ currentLocale: prop }: Props = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [currentLocale, setCurrentLocale] = useState<Locale>(
    prop ?? DEFAULT_LOCALE,
  );

  // If no SSR-provided locale, discover from the cookie on mount.
  useEffect(() => {
    if (prop) return;
    setCurrentLocale(readLocaleCookie());
  }, [prop]);

  function pick(next: Locale) {
    if (next === currentLocale) return;
    startTransition(async () => {
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      setCurrentLocale(next);
      // Re-fetch the current route so SSR picks up the new cookie.
      router.refresh();
    });
  }

  return (
    <div
      className="inline-flex items-center gap-1 text-xs rounded-full border border-gray-200 bg-white"
      aria-label="Language selector"
    >
      <Globe className="h-3.5 w-3.5 ml-2 text-muted-foreground" />
      {LOCALES.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => pick(loc)}
          disabled={pending}
          className={`px-2 py-1 rounded-full ${
            loc === currentLocale
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {LABEL[loc]}
        </button>
      ))}
    </div>
  );
}
