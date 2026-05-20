/**
 * Admin authorisation — env-var whitelist of staff emails.
 *
 * Why a static list (not a DB column):
 *   - Customer support staff are a handful of people and turnover is rare.
 *   - Keeping this in env removes the "can a customer escalate themselves
 *     to admin via a SQL injection" failure mode entirely.
 *   - Rotating an attacker out is a deploy rather than a DB write.
 *
 * Format: `ADMIN_USER_EMAILS=alice@x.com,bob@x.com` (commas, no spaces).
 */

import { getUser } from '@/lib/db/queries';

function whitelistedEmails(): Set<string> {
  const raw = process.env.ADMIN_USER_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return whitelistedEmails().has(email.toLowerCase());
}

export async function getAdminUser() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}
