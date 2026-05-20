import { redirect } from 'next/navigation';
import { count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listingPacks } from '@/lib/db/schema';
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';
import OnboardingWizard from './wizard';

/**
 * /onboarding — new-user landing.
 *
 * - Unauthenticated → /sign-in
 * - Has at least one listing_pack → already onboarded → /dashboard
 * - Otherwise → render the wizard
 *
 * We rely on listing_packs.count as the onboarding signal instead of
 * adding a users.onboarded_at column — keeps the migration count down
 * and is a more honest signal (a user who deleted their packs probably
 * wants the wizard again).
 */
export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in?redirect=onboarding');

  const ws = await getWorkspaceForUser();
  if (!ws) redirect('/dashboard');

  const packCount = await db
    .select({ value: count() })
    .from(listingPacks)
    .where(eq(listingPacks.workspaceId, ws.id));

  if ((packCount[0]?.value ?? 0) > 0) {
    redirect('/dashboard');
  }

  return <OnboardingWizard userName={user.name ?? user.email} />;
}
