/**
 * POST /api/agent/listing-pack/runs
 *
 * Multipart proxy → agent /v1/agent/listing-pack/runs. Returns the SSE
 * stream from the agent so the browser can render `step.completed` /
 * `run.completed` events as they arrive.
 *
 * If `listing_pack_id` is missing, this route auto-creates the asset +
 * listing_pack rows from the uploaded file, so the browser only has to
 * upload once. Existing callers that DO supply a listing_pack_id are
 * unchanged.
 */

import { NextResponse } from 'next/server';
import { AgentRequestError } from '@/lib/agent-client';
import { requireWorkspaceSession, verifyRunInWorkspace } from '@/lib/agent/auth-guard';
import {
  getCategory,
  isCategoryRunnable,
} from '@/lib/compliance/category-guardrails';
import {
  getListingPackForWorkspace,
  insertAsset,
  insertListingPack,
} from '@/lib/db/asset-queries';
import { getStorage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_BASE = process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000';
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/gif',
  'image/heic',
]);

function extFor(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/tiff':
      return 'tif';
    case 'image/gif':
      return 'gif';
    case 'image/heic':
      return 'heic';
    default:
      return 'bin';
  }
}

export async function POST(request: Request) {
  // D58.1 — always require a session before forwarding to agent. The
  // earlier guard only fired when `listing_pack_id` was missing, which
  // meant a caller could supply ANY listing_pack_id from any workspace
  // and trigger a billed run on someone else's account.
  const auth = await requireWorkspaceSession();
  if (!auth.ok) return auth.response;
  const { user, workspace: ws } = auth;

  const incoming = await request.formData();
  const file = incoming.get('file');
  const platformsRaw = incoming.get('target_platforms');
  let listingPackId = incoming.get('listing_pack_id') as string | null;
  const category = (incoming.get('target_category') as string | null) ?? null;

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { type: 'invalid_request', message: 'file field required' } },
      { status: 400 },
    );
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json(
      { error: { type: 'invalid_request', message: `unsupported mime: ${mime}` } },
      { status: 415 },
    );
  }
  if (typeof platformsRaw !== 'string' || !platformsRaw) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request',
          message: 'target_platforms required',
        },
      },
      { status: 400 },
    );
  }

  // D53 — PRD § 00 § 3.3 red-line categories. Enforce server-side so a
  // client that ignores the warning banner can't slip through.
  if (!isCategoryRunnable(category)) {
    const cat = getCategory(category);
    return NextResponse.json(
      {
        error: {
          type: 'category_blocked',
          category,
          message:
            cat?.reason ??
            `Category "${category}" is not supported in v1 (regulatory risk).`,
        },
      },
      { status: 403 },
    );
  }
  let platforms: string[];
  try {
    platforms = JSON.parse(platformsRaw);
    if (!Array.isArray(platforms) || platforms.length === 0) {
      throw new Error('must be a non-empty JSON array');
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request',
          message: `target_platforms invalid: ${(err as Error).message}`,
        },
      },
      { status: 400 },
    );
  }

  // D58.1 — when a listing_pack_id IS supplied, verify it belongs to
  // this user's workspace. Without this check a signed-in user from
  // workspace A could pass workspace B's listing_pack_id and bill B.
  if (listingPackId) {
    const pack = await getListingPackForWorkspace(listingPackId, ws.id);
    if (!pack) {
      return NextResponse.json(
        {
          error: {
            type: 'forbidden',
            message: 'listing_pack_id not found in your workspace',
          },
        },
        { status: 403 },
      );
    }
  }

  // ── auto-create listing_pack when missing ─────────────────────
  if (!listingPackId) {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) {
      return NextResponse.json(
        { error: { type: 'invalid_request', message: 'empty upload' } },
        { status: 400 },
      );
    }
    if (bytes.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: { type: 'invalid_request', message: 'file too large' } },
        { status: 413 },
      );
    }

    // 1) asset row + storage put
    const created = await insertAsset({
      workspaceId: ws.id,
      uploaderUserId: user.id,
      type: 'source_photo',
      storageKey: 'pending',
      mime,
      fileSize: bytes.length,
      category,
    });
    const key = `workspaces/${ws.id}/assets/${created.id}.${extFor(mime)}`;
    const storage = getStorage();
    const put = await storage.put({ key, bytes, mime });

    const { db } = await import('@/lib/db/drizzle');
    const { assets } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    await db
      .update(assets)
      .set({ storageKey: put.storageKey, hash: put.sha256 })
      .where(eq(assets.id, created.id));

    // 2) listing_pack row
    const packName = file.name?.replace(/\.[^.]+$/, '') || 'Untitled pack';
    const pack = await insertListingPack({
      workspaceId: ws.id,
      name: packName.slice(0, 200),
      sourceAssetId: created.id,
      targetPlatforms: platforms,
      category,
      skuCount: 1,
    });
    listingPackId = pack.id;

    // Re-build the multipart body — we already consumed `file` via
    // arrayBuffer() so the original FormData reference still points to
    // the same File and is forwardable.
    incoming.set('listing_pack_id', listingPackId);
  }

  try {
    const token = process.env.AGENT_SERVICE_TOKEN ?? '';
    const upstream = await fetch(`${AGENT_BASE}/v1/agent/listing-pack/runs`, {
      method: 'POST',
      headers: token ? { 'x-agent-service-token': token } : {},
      body: incoming,
      signal: request.signal,
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          'content-type':
            upstream.headers.get('content-type') ?? 'application/json',
        },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  } catch (err) {
    const status = err instanceof AgentRequestError ? err.status : 502;
    return Response.json(
      {
        error: {
          type: 'agent_unavailable',
          message:
            err instanceof Error ? err.message : 'agent service unreachable',
        },
      },
      { status },
    );
  }
}
