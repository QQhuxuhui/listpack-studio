'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  Loader2,
  PlayCircle,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDictionary } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n/dictionary';

const PLATFORM_OPTIONS = ['amazon', 'shopify', 'ebay', 'temu', 'shein'] as const;

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

type Phase = 'intro' | 'upload' | 'running' | 'done';

export default function OnboardingWizard({ userName }: { userName: string }) {
  const router = useRouter();
  const { t } = useDictionary();
  const [phase, setPhase] = useState<Phase>('intro');
  const [file, setFile] = useState<File | null>(null);
  const [platforms, setPlatforms] = useState<string[]>(['amazon']);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [stepNames, setStepNames] = useState<string[]>([]);
  const [terminal, setTerminal] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const firstName = userName.split(/[@ ]/)[0];

  function togglePlatform(p: string) {
    setPlatforms((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  }

  async function startRun(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError('Pick a product photo first.');
    if (platforms.length === 0)
      return setError('Pick at least one target platform.');

    const fd = new FormData();
    fd.set('file', file);
    fd.set('target_platforms', JSON.stringify(platforms));
    fd.set('cost_cap_usd', '1.00');
    fd.set('user_intent', 'first onboarding run');

    setPhase('running');
    setStepNames([]);
    setRunId(null);
    setTerminal(null);

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
        setPhase('upload');
        return;
      }
      await consumeSse(res.body);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message);
      setPhase('upload');
    }
  }

  async function consumeSse(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const evt = parseSseBlock(raw);
        if (evt) handleEvent(evt);
      }
    }
  }

  function handleEvent(evt: SseEvent) {
    if (evt.event === 'run.started') {
      setRunId(evt.data['run_id'] as string);
    } else if (evt.event === 'step.completed') {
      const step = evt.data['step'] as string;
      setStepNames((cur) => [...cur, step]);
    } else if (
      evt.event === 'run.completed' ||
      evt.event === 'run.failed' ||
      evt.event === 'run.interrupted' ||
      evt.event === 'run.quota_exceeded' ||
      evt.event === 'run.quota_unavailable'
    ) {
      setTerminal(evt.event);
      setPhase('done');
    }
  }

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Step indicator */}
      <ol className="flex items-center gap-2 text-xs text-muted-foreground mb-8">
        <Step active={phase === 'intro'} done={phase !== 'intro'}>
          {t.onboarding.step_hello}
        </Step>
        <span>·</span>
        <Step
          active={phase === 'upload'}
          done={phase === 'running' || phase === 'done'}
        >
          {t.onboarding.step_upload}
        </Step>
        <span>·</span>
        <Step active={phase === 'running'} done={phase === 'done'}>
          {t.onboarding.step_running}
        </Step>
        <span>·</span>
        <Step active={phase === 'done'}>{t.onboarding.step_done}</Step>
      </ol>

      {phase === 'intro' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" />
              {fmt(t.onboarding.welcome, { name: firstName })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-700">{t.onboarding.intro_p1}</p>
            <ol className="space-y-1 text-sm pl-5 list-decimal text-gray-700">
              <li>{t.onboarding.intro_li1}</li>
              <li>{t.onboarding.intro_li2}</li>
              <li>{t.onboarding.intro_li3}</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              {t.onboarding.intro_free_disclosure}
            </p>
            <div className="pt-2">
              <Button onClick={() => setPhase('upload')}>
                {t.onboarding.start_with_photo}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImagePlus className="h-5 w-5 text-orange-500" />
              {t.onboarding.upload_h}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={startRun} className="space-y-4">
              <div>
                <Label htmlFor="onb-file">{t.onboarding.upload_photo_label}</Label>
                <Input
                  id="onb-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/tiff,image/gif"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t.onboarding.upload_help}
                </p>
              </div>
              <div>
                <Label className="mb-2 block">{t.onboarding.where_label}</Label>
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
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit">
                  {t.onboarding.run_agent} <PlayCircle className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/dashboard')}
                >
                  {t.onboarding.maybe_later}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {phase === 'running' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
              {t.onboarding.working}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {runId && (
              <p className="text-xs text-muted-foreground mb-3">
                run id <code>{runId}</code>
              </p>
            )}
            <ul className="space-y-2 text-sm">
              {stepNames.map((s, i) => (
                <li key={`${s}-${i}`} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  {s}
                </li>
              ))}
              {stepNames.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  {t.onboarding.waiting_first_step}
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {phase === 'done' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {terminal === 'run.completed' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  {t.onboarding.done_completed_h}
                </>
              ) : (
                <>{t.onboarding.done_other_h}: {terminal?.replace('run.', '')}</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {terminal === 'run.completed' ? (
              <p className="text-sm text-gray-700">
                {fmt(t.onboarding.done_completed_body, { n: stepNames.length })}
              </p>
            ) : (
              <p className="text-sm text-red-600">
                {t.onboarding.done_other_body}
              </p>
            )}
            <div className="flex gap-2 pt-2">
              {runId && (
                <Link href={`/dashboard/runs/${runId}`}>
                  <Button>{t.onboarding.view_outputs}</Button>
                </Link>
              )}
              <Link href="/dashboard">
                <Button variant="outline">{t.onboarding.go_dashboard}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function Step({
  active,
  done,
  children,
}: {
  active?: boolean;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full ${
        active
          ? 'bg-orange-500 text-white font-medium'
          : done
            ? 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-500'
      }`}
    >
      {children}
    </span>
  );
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
    /* ignore — empty data */
  }
  return { event, data };
}
