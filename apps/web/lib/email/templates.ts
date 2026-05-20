/**
 * Email templates — D56 upgraded to render via @react-email/components.
 *
 * Each builder returns `{ subject, html, text }` — the shape callers
 * (lib/email/index.ts) already expect. The HTML is produced by rendering
 * a React Email component (see lib/email/react/*.tsx); the text version
 * stays hand-rolled because plain-text emails don't get visual quirks
 * from clients and we want the wording to match exactly what we test.
 *
 * PRD § 5.2: "trial / overage warning must be sent 48h before charge" —
 * the trial-expiring + overage-warning templates carry that copy
 * verbatim in both HTML + text.
 */

import { render } from '@react-email/render';
import { createElement } from 'react';

import type { EmailPayload } from './client';
import { OverageWarningEmail } from './react/OverageWarningEmail';
import { PasswordResetEmail } from './react/PasswordResetEmail';
import { TrialExpiringEmail } from './react/TrialExpiringEmail';
import { WelcomeEmail } from './react/WelcomeEmail';
import { WorkspaceInvitationEmail } from './react/WorkspaceInvitationEmail';

const BRAND = 'ListPack Studio';

// ─── welcome ────────────────────────────────────────────────────


export interface WelcomeProps {
  to: string;
  name?: string;
  workspaceName: string;
  dashboardUrl: string;
}

export async function welcomeEmail(
  p: WelcomeProps,
): Promise<EmailPayload> {
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
  const html = await renderToString(
    createElement(WelcomeEmail, {
      name: p.name,
      workspaceName: p.workspaceName,
      dashboardUrl: p.dashboardUrl,
    }),
  );
  return { to: p.to, subject, html, text };
}

// ─── password reset ────────────────────────────────────────────


export interface PasswordResetProps {
  to: string;
  resetUrl: string;
}

export async function passwordResetEmail(
  p: PasswordResetProps,
): Promise<EmailPayload> {
  const subject = `Reset your ${BRAND} password`;
  const text = `We received a request to reset the password on your
${BRAND} account.

Reset it here (valid for 1 hour):
${p.resetUrl}

If you didn't ask for this, ignore this email — your password stays
the same. Tokens expire automatically.

— ${BRAND}
`;
  const html = await renderToString(
    createElement(PasswordResetEmail, { resetUrl: p.resetUrl }),
  );
  return { to: p.to, subject, html, text };
}

// ─── workspace invitation ─────────────────────────────────────


export interface WorkspaceInvitationProps {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: 'admin' | 'editor' | 'viewer';
  acceptUrl: string;
}

export async function workspaceInvitationEmail(
  p: WorkspaceInvitationProps,
): Promise<EmailPayload> {
  const subject = `${p.inviterName} invited you to ${p.workspaceName} on ${BRAND}`;
  const text = `${p.inviterName} invited you to join the ${p.workspaceName}
workspace on ${BRAND} as ${p.role}.

Accept the invitation (and create your account if you don't have one):
${p.acceptUrl}

If you weren't expecting this, you can safely ignore the email — the
invitation expires in 14 days.

— ${BRAND}
`;
  const html = await renderToString(
    createElement(WorkspaceInvitationEmail, {
      inviterName: p.inviterName,
      workspaceName: p.workspaceName,
      role: p.role,
      acceptUrl: p.acceptUrl,
    }),
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

export async function trialExpiringEmail(
  p: TrialExpiringProps,
): Promise<EmailPayload> {
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
  const html = await renderToString(
    createElement(TrialExpiringEmail, {
      name: p.name,
      planName: p.planName,
      expiresOnIso: p.expiresOnIso,
      manageUrl: p.manageUrl,
    }),
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

export async function overageWarningEmail(
  p: OverageWarningProps,
): Promise<EmailPayload> {
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
  const html = await renderToString(
    createElement(OverageWarningEmail, {
      name: p.name,
      planName: p.planName,
      skuUsed: p.skuUsed,
      skuQuota: p.skuQuota,
      overagePerSku: p.overagePerSku,
      manageUrl: p.manageUrl,
    }),
  );
  return { to: p.to, subject, html, text };
}

// ─── render helper ────────────────────────────────────────────


// @react-email/render 2.0+ returns Promise<string>. We await it inside
// each template builder above and expose Promise<EmailPayload> to the
// world — the email send wrappers (lib/email/index.ts) await us in turn.
async function renderToString(
  element: React.ReactElement,
): Promise<string> {
  return render(element);
}
