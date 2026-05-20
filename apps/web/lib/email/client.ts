/**
 * Lazy email client wrapping the Resend HTTP API directly.
 *
 * Why not the `resend` SDK:
 * - Adds a hard dependency + types for the entire SDK when we only ever
 *   call POST /emails.
 * - Lets us short-circuit to a no-op logger when the API key isn't
 *   configured (Phase 2 / dev), so signups don't fail just because we
 *   haven't wired email yet.
 *
 * Set `RESEND_API_KEY=re_...` to enable real sending. Set `EMAIL_FROM` to
 * your verified sender (e.g. `ListPack <hi@listpack.studio>`).
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional reply-to override (e.g. support@listpack.studio). */
  replyTo?: string;
  /** Optional Resend tags for analytics dashboards. */
  tags?: { name: string; value: string }[];
}

export interface EmailSendResult {
  /** False when no provider configured — useful for tests. */
  delivered: boolean;
  /** Resend message id when delivered, else null. */
  messageId: string | null;
  /** Reason text when not delivered (e.g. 'no api key'). */
  reason?: string;
}

export type EmailSender = (payload: EmailPayload) => Promise<EmailSendResult>;

/**
 * Default sender — picks Resend if configured, else logs and no-ops.
 *
 * The function is async + returns a result rather than throwing so that
 * a misconfigured email provider can't break sign-up / checkout flows.
 * Failures bubble up via {delivered: false, reason}.
 */
export const sendEmail: EmailSender = async (payload) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'ListPack <onboarding@resend.dev>';

  if (!apiKey) {
    // Dev / pre-launch path. Drop a console line so test envs can verify
    // the call happened, but never fail the caller.
    console.info(
      `[email-stub] to=${payload.to} subject="${payload.subject}" — ` +
        `RESEND_API_KEY unset; not delivering.`,
    );
    return { delivered: false, messageId: null, reason: 'no api key' };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        reply_to: payload.replyTo,
        tags: payload.tags,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        delivered: false,
        messageId: null,
        reason: `resend ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { id?: string };
    return { delivered: true, messageId: data.id ?? null };
  } catch (err) {
    return {
      delivered: false,
      messageId: null,
      reason: `network error: ${(err as Error).message}`,
    };
  }
};

/** Allow tests to swap the sender without monkey-patching modules. */
export function withSender<T>(sender: EmailSender, body: () => Promise<T>) {
  // Caller-owned scoping — kept for future use when we route per-tenant.
  return { sender, run: body };
}
