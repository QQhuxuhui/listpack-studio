/**
 * Multipart proxy: browser → this route → apps/agent /v1/compliance/auto-fix.
 *
 * Same token-injection / shape-validation pattern as
 * /api/agent/compliance/check. Pass-through the agent's JSON response
 * (which includes the fixed image as base64 + applied actions metadata).
 */

import { AgentRequestError } from '@/lib/agent-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_BASE = process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000';

export async function POST(request: Request) {
  const incoming = await request.formData();
  const file = incoming.get('file');
  const actions = incoming.get('actions');

  if (!(file instanceof File)) {
    return Response.json(
      { error: { type: 'invalid_request', message: 'file field required' } },
      { status: 400 },
    );
  }
  if (typeof actions !== 'string' || !actions) {
    return Response.json(
      {
        error: {
          type: 'invalid_request',
          message: 'actions JSON array required',
        },
      },
      { status: 400 },
    );
  }

  try {
    const token = process.env.AGENT_SERVICE_TOKEN ?? '';
    const upstream = await fetch(`${AGENT_BASE}/v1/compliance/auto-fix`, {
      method: 'POST',
      headers: token ? { 'x-agent-service-token': token } : {},
      body: incoming,
    });

    const body = await upstream.text();
    return new Response(body, {
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
