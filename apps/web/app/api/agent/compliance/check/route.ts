import { AgentRequestError } from '@/lib/agent-client';

/**
 * Multipart proxy: browser → this route → apps/agent /v1/compliance/check.
 *
 * Why proxy: token injection (agent token stays server-side) + single place
 * to add per-workspace rate limiting / audit logging.
 *
 * Compliance checks are free (no SKU consumed) so we don't touch the
 * workspace's subscription here — that's the auto-fix endpoint's job (D11+).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_BASE = process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000';

export async function POST(request: Request) {
  // Stream the multipart body through to agent. Re-using formData() works
  // because Next 15 already buffers + parses; for very large uploads we'd
  // forward request.body as a duplex stream, but our 20MB cap makes buffering
  // the simpler choice.
  const incoming = await request.formData();

  // Validate at the proxy layer so the user sees a clear error before
  // we forward to the agent. Agent re-validates as defence in depth.
  const file = incoming.get('file');
  const platform = incoming.get('target_platform');
  if (!(file instanceof File)) {
    return Response.json(
      { error: { type: 'invalid_request', message: 'file field required' } },
      { status: 400 },
    );
  }
  if (typeof platform !== 'string' || !platform) {
    return Response.json(
      { error: { type: 'invalid_request', message: 'target_platform required' } },
      { status: 400 },
    );
  }

  try {
    const token = process.env.AGENT_SERVICE_TOKEN ?? '';
    const upstream = await fetch(`${AGENT_BASE}/v1/compliance/check`, {
      method: 'POST',
      headers: token ? { 'x-agent-service-token': token } : {},
      body: incoming,
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
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
