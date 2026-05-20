/**
 * i18n surface — kept zero-dep.
 *
 * Why not next-intl / react-i18next:
 *   - We need just two locales (en, zh-CN) and ~80 strings to start.
 *   - Both libs bring middleware-driven URL prefixes (/en/dashboard,
 *     /zh/dashboard) which would force a routing refactor of every
 *     internal Link. Cookie-based locale keeps URLs stable and is
 *     trivial to swap to next-intl later.
 *   - The full dictionary is ~6 KB JSON, smaller than the i18n libs.
 */

export const LOCALES = ['en', 'zh-CN'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'listpack_locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Dictionary type — every locale must provide the same keys. Using a
 * literal type derived from the en dictionary forces zh to stay in sync
 * (tsc errors when a key is missing).
 */
export type Dictionary = {
  common: {
    sign_in: string;
    sign_up: string;
    sign_out: string;
    skip: string;
    save: string;
    cancel: string;
    refresh: string;
    loading: string;
    pricing: string;
    dashboard: string;
    free: string;
    starter: string;
    pro: string;
    brand: string;
    most_popular: string;
  };
  landing: {
    badge: string;
    hero_h1_a: string;
    hero_h1_b: string;
    hero_sub: string;
    cta_start_free: string;
    cta_see_pricing: string;
    trust_line: string;
    platforms_label: string;
    how_h2: string;
    how_sub: string;
    step1_title: string;
    step1_body: string;
    step2_title: string;
    step2_body: string;
    step3_title: string;
    step3_body: string;
    values_h2: string;
    pricing_teaser_h2: string;
    pricing_teaser_sub: string;
    pricing_teaser_link: string;
    final_cta_h2: string;
    final_cta_sub: string;
    final_cta_btn: string;
  };
  pricing: {
    h1: string;
    sub: string;
    sales_footer_a: string;
    sales_footer_b: string;
    start_free: string;
    setup_in_progress: string;
    trial_days: string; // "{n}-day free trial"
    no_card: string;
    includes_skus: string; // "Includes {n} SKUs / month"
    overage_rate: string; // "then ${rate}/SKU"
    no_overage: string;
  };
  auth: {
    forgot_password: string;
    email_label: string;
    password_label: string;
    new_password_label: string;
    confirm_password_label: string;
    submit_sign_in: string;
    submit_sign_up: string;
    submit_send_reset: string;
    submit_set_new: string;
    forgot_h1: string;
    forgot_sub: string;
    reset_h1: string;
    sign_in_link: string;
    create_account: string;
    new_to_platform: string;
  };
};
