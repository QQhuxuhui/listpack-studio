/**
 * i18n surface — collapsed to zh-CN only.
 *
 * Multi-locale (en + zh-CN) is paused; the dictionary mechanism stays
 * so re-adding a second locale is a one-file change (add the locale
 * to LOCALES, register its dictionary, restore the switcher).
 */

export const LOCALES = ['zh-CN'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const LOCALE_COOKIE = 'listpack_locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Dictionary type — keys cover the surface that still reuses the
 * shared catalog (auth forms, dashboard quota copy, pricing cards,
 * sidebar nav). One-off landing-page strings are inlined directly
 * in their components since they have no twin.
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
    talk_to_sales: string;
  };
  nav: {
    workspace: string;
    general: string;
    activity: string;
    security: string;
  };
  dashboard: {
    workspace_settings: string;
    plan_and_usage: string;
    upgrade: string;
    manage_billing: string;
    skus_used: string; // "图片用量: {used} / {quota} 张"
    over_quota: string; // "本月超出 {n} 张"
    overage_rate_line: string; // "超额单价: ${rate} / 张"
    overage_disabled_line: string;
    overage_below_quota_line: string;
    overage_toggle_h: string;
    overage_on_desc: string;
    overage_off_desc: string;
    overage_enable: string;
    overage_disable: string;
    overage_saving: string;
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
    includes_skus: string; // "含 {n} 张图片 / 月"
    overage_rate: string; // "超额 ${rate} / 张"
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
    already_have_account: string;
    placeholder_email: string;
    placeholder_password: string;
    sign_in_h2: string;
    sign_up_h2: string;
  };
};
