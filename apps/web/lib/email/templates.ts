/**
 * Plain-function email templates.
 *
 * Each builder returns `{ subject, html, text }`. We keep markup minimal
 * (no React Email at this stage) so the bundle stays small and tests can
 * assert exact strings.
 *
 * PRD § 5.2: "trial / overage warning must be sent 48h before charge" —
 * the trial-expiring + overage-warning templates carry that copy verbatim.
 */

import type { EmailPayload } from './client';

const BRAND = 'ListPack Studio';
const BRAND_URL = 'https://listpack.studio';

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 20px; margin: 0 0 16px;">${escapeHtml(title)}</h1>
    ${body}
    <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;" />
    <p style="font-size: 12px; color: #888;">
      ${BRAND} · <a href="${BRAND_URL}" style="color: #888;">${BRAND_URL}</a><br />
      You're receiving this because you signed up at ${BRAND_URL}.
      <a href="${BRAND_URL}/unsubscribe" style="color: #888;">Unsubscribe</a>.
    </p>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── welcome ────────────────────────────────────────────────────


export interface WelcomeProps {
  to: string;
  name?: string;
  workspaceName: string;
  dashboardUrl: string;
}

export function welcomeEmail(p: WelcomeProps): EmailPayload {
  const greet = p.name ? `Hi ${p.name},` : 'Hi there,';
  const subject = `Welcome to ${BRAND} — start with 5 free SKUs`;
  const text = `${greet}

Welcome to ${BRAND}! Your workspace "${p.workspaceName}" is ready.

Here's the 3-step first run:
  1. Upload one product photo (JPG/PNG/WebP, up to 20MB)
  2. Pick the platforms you sell on (Amazon, Shopify, eBay, Temu, SHEIN)
  3. Watch the agent compliance-check, generate, and size your pack

Your dashboard: ${p.dashboardUrl}

Free tier includes 5 SKUs / month, no credit card. Hit reply if you need
help — a real person reads every reply.

— The ${BRAND} team
`;
  const html = shell(
    `Welcome to ${BRAND}`,
    `<p>${escapeHtml(greet)}</p>
     <p>Welcome to ${BRAND}! Your workspace <strong>${escapeHtml(p.workspaceName)}</strong> is ready.</p>
     <p><strong>3-step first run:</strong></p>
     <ol>
       <li>Upload one product photo (JPG/PNG/WebP, up to 20MB)</li>
       <li>Pick the platforms you sell on</li>
       <li>Watch the agent compliance-check, generate, and size your pack</li>
     </ol>
     <p>
       <a href="${escapeHtml(p.dashboardUrl)}"
          style="display: inline-block; background: #ea580c; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
         Open your dashboard
       </a>
     </p>
     <p style="color: #555;">
       Free tier includes 5 SKUs / month, no credit card.
       Reply to this email if you need help — a real person reads every reply.
     </p>`,
  );
  return { to: p.to, subject, html, text };
}

// ─── trial expiring (PRD § 5.3 must send ≥48h before charge) ─────


export interface TrialExpiringProps {
  to: string;
  name?: string;
  planName: string;
  expiresOnIso: string;
  manageUrl: string;
}

export function trialExpiringEmail(p: TrialExpiringProps): EmailPayload {
  const greet = p.name ? `Hi ${p.name},` : 'Hi there,';
  const expiresOn = new Date(p.expiresOnIso).toUTCString();
  const subject = `Your ${p.planName} trial ends ${expiresOn}`;
  const text = `${greet}

Heads up — your ${p.planName} free trial ends on ${expiresOn} (UTC).
After that we'll charge the card on file unless you cancel.

Cancel any time (no questions, no clawback):
${p.manageUrl}

This notice is sent at least 48 hours ahead of the charge per our user
agreement (PRD § 5.2 — "no surprise billing").

— ${BRAND}
`;
  const html = shell(
    `Your ${p.planName} trial ends ${expiresOn}`,
    `<p>${escapeHtml(greet)}</p>
     <p>Heads up — your <strong>${escapeHtml(p.planName)}</strong> free trial ends on
     <strong>${escapeHtml(expiresOn)} (UTC)</strong>. After that we'll charge the card
     on file unless you cancel.</p>
     <p><a href="${escapeHtml(p.manageUrl)}"
            style="display: inline-block; background: #111; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
       Manage subscription
     </a></p>
     <p style="font-size: 13px; color: #777;">
       This notice is sent at least 48 hours ahead of the charge per our
       user agreement — no surprise billing, ever.
     </p>`,
  );
  return { to: p.to, subject, html, text };
}

// ─── overage warning (PRD § 5.3) ─────────────────────────────


export interface OverageWarningProps {
  to: string;
  name?: string;
  planName: string;
  skuUsed: number;
  skuQuota: number;
  overagePerSku: number;
  manageUrl: string;
}

export function overageWarningEmail(p: OverageWarningProps): EmailPayload {
  const greet = p.name ? `Hi ${p.name},` : 'Hi there,';
  const subject = `Heads up — you've hit your ${p.planName} SKU quota`;
  const text = `${greet}

You've used ${p.skuUsed} of ${p.skuQuota} SKUs on the ${p.planName} plan.
Any further SKU this billing period costs $${p.overagePerSku.toFixed(2)} each.

You can:
  - Keep going at the overage rate (we'll itemise it on your next invoice)
  - Upgrade to a higher plan for a better per-SKU rate
  - Disable overage to halt further generation

Manage your plan: ${p.manageUrl}

— ${BRAND}
`;
  const html = shell(
    `You've hit your ${p.planName} SKU quota`,
    `<p>${escapeHtml(greet)}</p>
     <p>You've used <strong>${p.skuUsed}</strong> of <strong>${p.skuQuota}</strong>
     SKUs on the ${escapeHtml(p.planName)} plan. Any further SKU this billing period
     costs <strong>$${p.overagePerSku.toFixed(2)}</strong> each.</p>
     <ul>
       <li>Keep going at the overage rate (itemised on your next invoice)</li>
       <li>Upgrade to a higher plan for a better per-SKU rate</li>
       <li>Disable overage to halt further generation</li>
     </ul>
     <p><a href="${escapeHtml(p.manageUrl)}"
            style="display: inline-block; background: #ea580c; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
       Manage your plan
     </a></p>`,
  );
  return { to: p.to, subject, html, text };
}
