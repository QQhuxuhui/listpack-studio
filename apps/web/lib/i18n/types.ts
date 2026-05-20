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
    talk_to_sales: string;
  };
  nav: {
    workspace: string;
    new_run: string;
    recent_runs: string;
    connections: string;
    brand_kit: string;
    compliance: string;
    general: string;
    activity: string;
    security: string;
  };
  dashboard: {
    workspace_settings: string;
    plan_and_usage: string;
    upgrade: string;
    manage_billing: string;
    skus_used: string; // "SKUs used this period: {used} / {quota}"
    over_quota: string; // "You're {n} SKUs over your monthly quota."
    overage_rate_line: string; // "Overage rate: ${rate} / SKU."
    overage_disabled_line: string;
    overage_below_quota_line: string; // "Beyond {quota} SKUs: ${rate} per SKU"
    overage_toggle_h: string;
    overage_on_desc: string;
    overage_off_desc: string;
    overage_enable: string;
    overage_disable: string;
    overage_saving: string;
  };
  runs: {
    list_h1: string;
    latest_n: string;
    none_yet_a: string;
    none_yet_b: string;
    cost_label: string;
    cap_label: string;
    started_label: string;
    ended_label: string;
    detail_back: string;
    detail_outputs_h: string;
    detail_steps_h: string;
    detail_no_outputs_completed: string;
    detail_no_outputs_in_progress: string;
    detail_planner_h: string;
    new_h1: string;
    new_source_h: string;
    new_file_label: string;
    new_platforms_label: string;
    new_intent_label: string;
    new_cost_cap_label: string;
    new_start: string;
    new_running: string;
    new_pause: string;
    new_cancel: string;
    new_progress_h: string;
  };
  onboarding: {
    step_hello: string;
    step_upload: string;
    step_running: string;
    step_done: string;
    welcome: string; // "Welcome, {name}."
    intro_p1: string;
    intro_li1: string;
    intro_li2: string;
    intro_li3: string;
    intro_free_disclosure: string;
    start_with_photo: string;
    upload_h: string;
    upload_photo_label: string;
    upload_help: string;
    where_label: string;
    run_agent: string;
    maybe_later: string;
    working: string;
    waiting_first_step: string;
    done_completed_h: string;
    done_other_h: string;
    done_completed_body: string; // "{n} agent steps completed..."
    done_other_body: string;
    view_outputs: string;
    go_dashboard: string;
  };
  connections: {
    h1: string;
    connect_shopify_h: string;
    shop_label: string;
    shop_placeholder: string;
    shop_help: string;
    connect_btn: string;
    connected_h: string;
    none_yet: string;
    disconnect: string;
    confirm_disconnect: string;
    invalid_shop: string;
  };
  brand_kit: {
    h1: string;
    sub: string;
    title_new: string;
    title_edit: string;
    kit_name: string;
    logo: string;
    no_logo: string;
    remove_logo: string;
    primary: string;
    secondary: string;
    accent: string;
    font_family: string;
    font_placeholder: string;
    tagline: string;
    tagline_placeholder: string;
    save_btn: string;
    saving: string;
    saved_ok: string;
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
