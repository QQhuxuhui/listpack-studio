import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { platformConnections } from '@/lib/db/schema';
import { getWorkspaceForUser } from '@/lib/db/queries';

/**
 * DELETE /api/shopify/connections/{id}
 *
 * Remove a Shopify connection from the current user's workspace. The DB
 * row is dropped but Shopify itself still treats the install as valid
 * (token isn't revoked) — admins must hit the merchant portal to
 * uninstall the embedded app for a hard disconnect.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ws = await getWorkspaceForUser();
  if (!ws) {
    return NextResponse.json({ error: 'no workspace' }, { status: 401 });
  }

  const deleted = await db
    .delete(platformConnections)
    .where(
      and(
        eq(platformConnections.id, id),
        eq(platformConnections.workspaceId, ws.id),
        eq(platformConnections.platform, 'shopify'),
      ),
    )
    .returning({ id: platformConnections.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'connection not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: id });
}
