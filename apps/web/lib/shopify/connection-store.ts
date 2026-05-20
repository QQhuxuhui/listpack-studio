/**
 * Persist + load Shopify (and future Amazon/eBay) platform connections.
 *
 * Drizzle-flavoured wrappers over `platform_connections`. Tokens are
 * encrypted at rest via lib/shopify/crypto.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  platformConnections,
  type PlatformConnection,
} from '@/lib/db/schema';
import { encryptToken } from './crypto';

export type ShopifyConnectionInput = {
  workspaceId: string;
  shop: string;
  accessToken: string;
  scope: string;
  metadata?: Record<string, unknown>;
};

/**
 * Upsert a Shopify connection for a workspace. If the same shop is
 * connected again (e.g. re-install) we overwrite the token. The unique
 * index `uniq_platform_connection_account` enforces (workspace, platform,
 * external_account_id).
 */
export async function upsertShopifyConnection(
  input: ShopifyConnectionInput,
): Promise<PlatformConnection> {
  const encrypted = encryptToken(input.accessToken);

  // Drizzle's onConflictDoUpdate keeps this atomic; we ON UPDATE SET the
  // new token so the latest install wins.
  const inserted = await db
    .insert(platformConnections)
    .values({
      workspaceId: input.workspaceId,
      platform: 'shopify',
      externalAccountId: input.shop,
      encryptedAccessToken: encrypted,
      scopes: input.scope,
      metadata: input.metadata ?? null,
    })
    .onConflictDoUpdate({
      target: [
        platformConnections.workspaceId,
        platformConnections.platform,
        platformConnections.externalAccountId,
      ],
      set: {
        encryptedAccessToken: encrypted,
        scopes: input.scope,
        metadata: input.metadata ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!inserted[0]) {
    throw new Error('failed to upsert shopify connection (empty return)');
  }
  return inserted[0];
}

export async function getShopifyConnection(
  workspaceId: string,
  shop: string,
): Promise<PlatformConnection | null> {
  const rows = await db
    .select()
    .from(platformConnections)
    .where(
      and(
        eq(platformConnections.workspaceId, workspaceId),
        eq(platformConnections.platform, 'shopify'),
        eq(platformConnections.externalAccountId, shop),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listShopifyConnections(
  workspaceId: string,
): Promise<PlatformConnection[]> {
  return db
    .select()
    .from(platformConnections)
    .where(
      and(
        eq(platformConnections.workspaceId, workspaceId),
        eq(platformConnections.platform, 'shopify'),
      ),
    );
}

export async function deleteShopifyConnection(
  workspaceId: string,
  shop: string,
): Promise<void> {
  await db
    .delete(platformConnections)
    .where(
      and(
        eq(platformConnections.workspaceId, workspaceId),
        eq(platformConnections.platform, 'shopify'),
        eq(platformConnections.externalAccountId, shop),
      ),
    );
}
