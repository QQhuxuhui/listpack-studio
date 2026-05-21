import { AgentRequestError, agentStream } from '@/lib/agent-client';
import { requireWorkspaceSession } from '@/lib/agent/auth-guard';

/**
 * SSE proxy: browser EventSource → this route → apps/agent /v1/hello/stream.
 *
 * Why proxy instead of opening EventSource directly to the agent service?
 * 1. The agent service runs on a different origin (CORS noise).
 * 2. Lets us inject service-to-service auth (token never leaves the server).
 * 3. Single place to add rate limiting, audit logging, workspace billing.
 *
 * Sign-in required (D58.4). The /dashboard/agent-demo page that calls
 * this route only renders behind the (dashboard) layout, so the gate
 * shouldn't break legit users — and it stops anonymous hits from
 * exercising the upstream LLM-call surface with our shared token.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireWorkspaceSession();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const message = url.searchParams.get('message') ?? 'world';

  try {
    const upstream = await agentStream(
      `/v1/hello/stream?message=${encodeURIComponent(message)}`,
      { signal: request.signal },
    );

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        // Prevent Vercel / Cloudflare buffering middleware from holding SSE chunks.
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
