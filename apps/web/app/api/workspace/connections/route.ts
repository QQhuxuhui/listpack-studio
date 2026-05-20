import { NextResponse } from 'next/server';
import {
  getWorkspaceForUser,
} from '@/lib/db/queries';
import { listShopifyConnections } from '@/lib/shopify/connection-store';

/**
 * GET /api/workspace/connections
 *
 * Returns the current workspace's platform connections, redacted (no tokens).
 * Used by /dashboard/connections to render Connect / Disconnect UI.
 */
export async function GET() {
  const ws = await getWorkspaceForUser();
  if (!ws) {
    return NextResponse.json({ error: 'no workspace' }, { status: 401 });
  }

  const shopify = await listShopifyConnections(ws.id);

  return NextResponse.json({
    shopify: shopify.map((c) => ({
      id: c.id,
      shop: c.externalAccountId,
      scopes: c.scopes,
      connectedAt: c.createdAt.toISOString(),
      metadata: c.metadata,
    })),
  });
}
