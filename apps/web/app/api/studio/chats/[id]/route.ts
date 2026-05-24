/**
 * GET    /api/studio/chats/[id]   → chat + messages + referenced assets
 * DELETE /api/studio/chats/[id]   → soft delete
 */
import { NextResponse } from 'next/server';
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';
import {
  getAssetsByIdsForWorkspace,
  getChatForWorkspace,
  listMessagesForChat,
  softDeleteChat,
} from '@/lib/db/studio-queries';
import { getStorage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const [user, ws] = await Promise.all([getUser(), getWorkspaceForUser()]);
  if (!user || !ws) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const chat = await getChatForWorkspace(id, ws.id);
  if (!chat) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const messages = await listMessagesForChat(chat.id);
  // Collect every referenced asset id across all messages and resolve
  // them in a single query so the client can render <img src> directly.
  const ids = new Set<string>();
  for (const m of messages) {
    for (const r of m.refs ?? []) ids.add(r.asset_id);
    for (const x of m.outputAssetIds ?? []) ids.add(x);
  }
  const assetRows = await getAssetsByIdsForWorkspace(Array.from(ids), ws.id);
  const storage = getStorage();
  const assets = assetRows.map((a) => ({
    id: a.id,
    mime: a.mime,
    width: a.width,
    height: a.height,
    fileSize: a.fileSize,
    type: a.type,
    publicUrl: a.cdnUrl ?? storage.publicUrl(a.storageKey),
    createdAt: a.createdAt,
  }));

  return NextResponse.json({ chat, messages, assets });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const [user, ws] = await Promise.all([getUser(), getWorkspaceForUser()]);
  if (!user || !ws) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const chat = await getChatForWorkspace(id, ws.id);
  if (!chat) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await softDeleteChat(chat.id, ws.id);
  return NextResponse.json({ ok: true });
}
