/**
 * GET /api/studio/models
 * Returns the whitelist of image-generation models the UI can pick.
 */
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { DEFAULT_MODEL_ID, listModels } from '@/lib/studio/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  return NextResponse.json({
    defaultModel: DEFAULT_MODEL_ID,
    models: listModels(),
  });
}
