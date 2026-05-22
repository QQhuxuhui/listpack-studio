/**
 * GET  /api/studio/chats          → list workspace's chats (most recent)
 * POST /api/studio/chats          → create new chat
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';
import { createChat, listChatsForWorkspace } from '@/lib/db/studio-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [user, ws] = await Promise.all([getUser(), getWorkspaceForUser()]);
  if (!user || !ws) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }
  const chats = await listChatsForWorkspace(ws.id);
  return NextResponse.json({ chats });
}

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const [user, ws] = await Promise.all([getUser(), getWorkspaceForUser()]);
  if (!user || !ws) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }
  const chat = await createChat({
    workspaceId: ws.id,
    userId: user.id,
    title: parsed.data.title,
  });
  return NextResponse.json({ chat });
}
