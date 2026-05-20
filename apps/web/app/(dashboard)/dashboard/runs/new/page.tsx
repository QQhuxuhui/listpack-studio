'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Circle, Loader2, XCircle, PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PLATFORM_OPTIONS = ['amazon', 'shopify', 'ebay', 'temu', 'shein'] as const;

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

type StepStatus = 'running' | 'completed' | 'failed' | 'skipped';

interface StepCard {
  step: string;
  status: StepStatus;
  message?: string;
  cost_usd?: string;
}

export default function NewRunPage() {
  const [listingPackId, setListingPackId] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['amazon']);
  const [intent, setIntent] = useState('');
  const [costCap, setCostCap] = useState('1.00');
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function togglePlatform(p: string) {
    setPlatforms((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  }

  async function startRun(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSteps([]);
    setRunId(null);
    setTerminal(null);

    if (!file) {
      setError('Pick a product photo first.');
      return;
    }
    if (!listingPackId) {
      setError('Listing pack ID required (will be auto-created in v2).');
      return;
    }
    if (platforms.length === 0) {
      setError('Pick at least one target platform.');
      return;
    }

    const fd = new FormData();
    fd.set('file', file);
    fd.set('listing_pack_id', listingPackId);
    fd.set('target_platforms', JSON.stringify(platforms));
    if (intent) fd.set('user_intent', intent);
    fd.set('cost_cap_usd', costCap);

    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/agent/listing-pack/runs', {
        method: 'POST',
        body: fd,
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        setError(`Run failed to start: ${text.slice(0, 200)}`);
        setRunning(false);
        return;
      }
      await consumeSse(res.body);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function consumeSse(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const evt = parseSseBlock(raw);
        if (evt) handleEvent(evt);
      }
    }
  }

  function handleEvent(evt: SseEvent) {
    if (evt.event === 'run.started') {
      const id = evt.data['run_id'] as string;
      setRunId(id);
    } else if (evt.event === 'step.completed') {
      const step = evt.data['step'] as string;
      const status = (evt.data['status'] as StepStatus) ?? 'completed';
      setSteps((cur) => [
        ...cur,
        {
          step,
          status,
          message: evt.data['message'] as string | undefined,
          cost_usd: evt.data['cost_usd'] as string | undefined,
        },
      ]);
    } else if (
      evt.event === 'run.completed' ||
      evt.event === 'run.failed' ||
      evt.event === 'run.interrupted' ||
      evt.event === 'run.quota_exceeded' ||
      evt.event === 'run.quota_unavailable'
    ) {
      setTerminal(evt.event);
      if (evt.event !== 'run.completed') {
        setError((evt.data['message'] as string) ?? evt.event);
      }
    }
  }

  async function callHitl(op: 'pause' | 'resume' | 'cancel' | 'fork') {
    if (!runId) return;
    const res = await fetch(`/api/agent/listing-pack/runs/${runId}/${op}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: op === 'cancel' ? JSON.stringify({ reason: 'user clicked cancel' }) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      alert(`HITL ${op} failed: ${text.slice(0, 200)}`);
    }
  }

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-3xl">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">
        New listing pack run
      </h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Source + targets</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={startRun} className="space-y-4">
            <div>
              <Label htmlFor="file" className="mb-2">
                Product photo
              </Label>
              <Input
                id="file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/tiff,image/gif"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={running}
              />
            </div>
            <div>
              <Label htmlFor="lpid" className="mb-2">
                Listing pack id (UUID)
              </Label>
              <Input
                id="lpid"
                placeholder="00000000-…"
                value={listingPackId}
                onChange={(e) => setListingPackId(e.target.value)}
                disabled={running}
              />
              <p className="text-xs text-muted-foreground mt-1">
                v1: create the listing_packs row first (DB seed / API).
                v2 will auto-create.
              </p>
            </div>
            <div>
              <Label className="mb-2 block">Target platforms</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map((p) => (
                  <label
                    key={p}
                    className={`cursor-pointer text-sm rounded-full border px-3 py-1 ${
                      platforms.includes(p)
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={platforms.includes(p)}
                      onChange={() => togglePlatform(p)}
                      disabled={running}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="intent" className="mb-2">
                Intent (optional)
              </Label>
              <Input
                id="intent"
                placeholder="studio shot for SS26 launch"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                disabled={running}
              />
            </div>
            <div>
              <Label htmlFor="cap" className="mb-2">
                Cost cap (USD)
              </Label>
              <Input
                id="cap"
                value={costCap}
                onChange={(e) => setCostCap(e.target.value)}
                disabled={running}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={running}>
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  'Start run'
                )}
              </Button>
              {running && runId && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => callHitl('pause')}
                  >
                    Pause
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => callHitl('cancel')}
                    className="text-red-600"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {(runId || steps.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Progress
              {terminal && (
                <span
                  className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                    terminal === 'run.completed'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {terminal.replace('run.', '')}
                </span>
              )}
            </CardTitle>
            {runId && (
              <p className="text-xs text-muted-foreground">
                run id: <code>{runId}</code>
              </p>
            )}
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li
                  key={`${s.step}-${i}`}
                  className="flex items-start gap-3 text-sm"
                >
                  <StatusIcon status={s.status} />
                  <div className="flex-1">
                    <p className="font-medium">{s.step}</p>
                    {s.message && (
                      <p className="text-xs text-muted-foreground">
                        {s.message}
                      </p>
                    )}
                  </div>
                  {s.cost_usd && (
                    <span className="text-xs text-muted-foreground">
                      ${s.cost_usd}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'completed')
    return <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />;
  if (status === 'failed')
    return <XCircle className="h-4 w-4 text-red-500 mt-0.5" />;
  if (status === 'skipped')
    return <PauseCircle className="h-4 w-4 text-gray-400 mt-0.5" />;
  return <Circle className="h-4 w-4 text-gray-400 mt-0.5 animate-pulse" />;
}

function parseSseBlock(raw: string): SseEvent | null {
  let event = '';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!event) return null;
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    // ignore — keep empty
  }
  return { event, data };
}
