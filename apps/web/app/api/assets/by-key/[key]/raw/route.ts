/**
 * GET /api/assets/by-key/{key}/raw
 *
 * Streams a stored asset by storage key. Used by LocalFsStorage's
 * publicUrl() so the agent service (or browser) can fetch the bytes.
 *
 * Access control: caller must be authenticated AND the key must start
 * with their workspace prefix.
 */

import { NextResponse } from 'next/server';
import { getWorkspaceForUser } from '@/lib/db/queries';
import { getStorage } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key: encodedKey } = await params;
  const key = decodeURIComponent(encodedKey);

  const ws = await getWorkspaceForUser();
  if (!ws) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }
  if (!key.startsWith(`workspaces/${ws.id}/`)) {
    // Don't leak existence; 404 instead of 403.
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  try {
    const { bytes, mime } = await getStorage().get(key);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': mime,
        'cache-control': 'private, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
