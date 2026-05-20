/**
 * POST /api/agent/listing-pack/runs/{id}/{pause|resume|cancel|fork}
 *
 * Thin JSON proxy → agent HITL endpoints.
 */

import { AgentRequestError } from '@/lib/agent-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_BASE = process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000';
const ALLOWED_OPS = new Set(['pause', 'resume', 'cancel', 'fork']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; op: string }> },
) {
  const { id, op } = await params;
  if (!ALLOWED_OPS.has(op)) {
    return Response.json(
      { error: { type: 'invalid_request', message: `unknown op: ${op}` } },
      { status: 400 },
    );
  }

  let body: string | undefined;
  // pause/resume have no body; cancel/fork accept an optional JSON body.
  if (op === 'cancel' || op === 'fork') {
    try {
      const incoming = await request.json();
      body = JSON.stringify(incoming);
    } catch {
      body = undefined;
    }
  }

  try {
    const token = process.env.AGENT_SERVICE_TOKEN ?? '';
    const upstream = await fetch(
      `${AGENT_BASE}/v1/agent/listing-pack/runs/${encodeURIComponent(id)}/${op}`,
      {
        method: 'POST',
        headers: {
          ...(token ? { 'x-agent-service-token': token } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body,
      },
    );

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'content-type':
          upstream.headers.get('content-type') ?? 'application/json',
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
