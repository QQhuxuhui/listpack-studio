import 'server-only';

/**
 * Service-to-service client for apps/agent (Python LangGraph service).
 *
 * - JSON endpoints: `agentFetch(path)` returns parsed JSON.
 * - Streaming endpoints: `agentStream(path)` returns the upstream `Response`
 *   so the caller can pipe it back through Next.js as SSE.
 *
 * Auth: shared bearer-equivalent token in `x-agent-service-token`.
 */

const DEFAULT_AGENT_URL = 'http://localhost:8000';

function agentBase(): string {
  return process.env.AGENT_SERVICE_URL ?? DEFAULT_AGENT_URL;
}

function authHeaders(): Record<string, string> {
  const token = process.env.AGENT_SERVICE_TOKEN ?? '';
  return token ? { 'x-agent-service-token': token } : {};
}

export class AgentRequestError extends Error {
  readonly status: number;
  readonly responseBody: string;

  constructor(status: number, message: string, responseBody = '') {
    super(message);
    this.name = 'AgentRequestError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

export async function agentFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${agentBase()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...authHeaders(),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AgentRequestError(
      res.status,
      `agent ${path} failed: ${res.status} ${res.statusText}`,
      body,
    );
  }
  return res.json() as Promise<T>;
}

/**
 * Stream from agent. Returns the raw upstream Response so a Next.js route
 * can pipe `res.body` back as `text/event-stream` to the browser.
 */
export async function agentStream(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${agentBase()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: 'text/event-stream',
      ...authHeaders(),
      ...init.headers,
    },
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    throw new AgentRequestError(
      res.status,
      `agent stream ${path} failed: ${res.status} ${res.statusText}`,
      body,
    );
  }
  return res;
}
