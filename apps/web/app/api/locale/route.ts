import { NextResponse } from 'next/server';
import { LOCALES, LOCALE_COOKIE, isLocale } from '@/lib/i18n/types';

/**
 * POST /api/locale  body: { locale: "en" | "zh-CN" }
 *
 * Sets the locale cookie so subsequent SSR renders pick up the new
 * dictionary. 1-year TTL; httpOnly stays false so client code can
 * also read it for instant client-only re-renders.
 */
export async function POST(request: Request) {
  let body: { locale?: string };
  try {
    body = (await request.json()) as { locale?: string };
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!isLocale(body.locale)) {
    return NextResponse.json(
      { error: `locale must be one of ${LOCALES.join(', ')}` },
      { status: 400 },
    );
  }

  const res = NextResponse.json({ ok: true, locale: body.locale });
  res.cookies.set({
    name: LOCALE_COOKIE,
    value: body.locale,
    httpOnly: false,
    // secure cookies are dropped by Safari (and stricter Firefox configs)
    // on http://localhost. In dev we MUST send the cookie back unencrypted
    // so the locale persists; prod (https) keeps secure on.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  return res;
}
