/**
 * POST /api/agent/listing-pack/runs
 *
 * Multipart proxy → agent /v1/agent/listing-pack/runs. Returns the SSE
 * stream from the agent so the browser can render `step.completed` /
 * `run.completed` events as they arrive.
 *
 * The proxy keeps `AGENT_SERVICE_TOKEN` server-side; the browser never
 * sees the agent URL or token.
 */

import { AgentRequestError } from '@/lib/agent-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_BASE = process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000';

export async function POST(request: Request) {
  const incoming = await request.formData();
  const file = incoming.get('file');
  const listingPackId = incoming.get('listing_pack_id');
  const platforms = incoming.get('target_platforms');

  if (!(file instanceof File)) {
    return Response.json(
      { error: { type: 'invalid_request', message: 'file field required' } },
      { status: 400 },
    );
  }
  if (typeof listingPackId !== 'string' || !listingPackId) {
    return Response.json(
      {
        error: {
          type: 'invalid_request',
          message: 'listing_pack_id required',
        },
      },
      { status: 400 },
    );
  }
  if (typeof platforms !== 'string' || !platforms) {
    return Response.json(
      {
        error: {
          type: 'invalid_request',
          message: 'target_platforms required',
        },
      },
      { status: 400 },
    );
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

    // Forward SSE stream as-is.
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
