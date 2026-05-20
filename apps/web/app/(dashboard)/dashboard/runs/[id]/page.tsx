'use client';

import Link from 'next/link';
import { use } from 'react';
import useSWR from 'swr';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  PauseCircle,
  RefreshCcw,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface StepRow {
  id: string;
  stepName: string;
  status: string;
  outputs: { message?: string; cost_usd?: string } | null;
  error: Record<string, unknown> | null;
  startedAt: string | null;
  endedAt: string | null;
}

interface OutputRow {
  id: string;
  platform: string;
  slot: string;
  assetId: string;
  mime: string;
  fileSize: number;
  publicUrl: string;
  metadata: Record<string, unknown> | null;
}

interface RunDetail {
  run: {
    id: string;
    status: string;
    currentStep: string | null;
    plan: Record<string, unknown> | null;
    state: Record<string, unknown> | null;
    costCapUsd: string | null;
    costSpentUsd: string;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string;
    error: Record<string, unknown> | null;
  };
  listingPack: {
    id: string;
    name: string;
    targetPlatforms: string[];
    category: string | null;
  };
  steps: StepRow[];
  outputs: OutputRow[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  planning: 'bg-blue-100 text-blue-700',
  running: 'bg-blue-100 text-blue-700',
  paused: 'bg-amber-100 text-amber-700',
  awaiting_user: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-200 text-gray-700',
};

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, mutate } = useSWR<RunDetail>(
    `/api/workspace/runs/${id}`,
    fetcher,
  );

  if (isLoading) {
    return (
      <section className="flex-1 p-4 lg:p-8">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }
  if (!data || 'error' in (data as object)) {
    return (
      <section className="flex-1 p-4 lg:p-8">
        <p className="text-sm text-red-600">Run not found.</p>
        <Link href="/dashboard/runs" className="text-sm underline mt-2 block">
          Back to runs
        </Link>
      </section>
    );
  }

  const { run, listingPack, steps, outputs } = data;
  const planObj = (run.plan ?? {}) as {
    render_scene?: boolean;
    render_a_plus?: boolean;
    render_banner?: boolean;
    refinement_rounds?: number;
    reasoning?: string;
  };

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/dashboard/runs"
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Recent runs
          </Link>
          <h1 className="text-lg lg:text-2xl font-medium mt-1">
            {listingPack.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            <span
              className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                STATUS_COLOR[run.status] ?? 'bg-gray-100 text-gray-700'
              }`}
            >
              {run.status}
            </span>{' '}
            · run <code className="text-xs">{run.id.slice(0, 8)}…</code>
            {run.currentStep && (
              <span className="ml-1">@ {run.currentStep}</span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* ── meta cards ────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-medium">
              ${Number(run.costSpentUsd).toFixed(4)}
            </p>
            {run.costCapUsd && (
              <p className="text-xs text-muted-foreground">
                cap ${Number(run.costCapUsd).toFixed(2)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Platforms</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{listingPack.targetPlatforms.join(', ')}</p>
            {listingPack.category && (
              <p className="text-xs text-muted-foreground">
                category: {listingPack.category}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Timing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs">
              Started:{' '}
              {run.startedAt
                ? new Date(run.startedAt).toLocaleString()
                : '—'}
            </p>
            <p className="text-xs">
              Ended:{' '}
              {run.endedAt
                ? new Date(run.endedAt).toLocaleString()
                : 'running…'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── plan ──────────────────────────────────────────────── */}
      {run.plan && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">Planner decision</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-2">
              {planObj.render_scene && (
                <Chip>scene</Chip>
              )}
              {planObj.render_a_plus && <Chip>a_plus</Chip>}
              {planObj.render_banner && <Chip>banner</Chip>}
              {planObj.refinement_rounds ? (
                <Chip>refine ×{planObj.refinement_rounds}</Chip>
              ) : null}
            </div>
            {planObj.reasoning && (
              <p className="text-xs text-muted-foreground italic">
                "{planObj.reasoning}"
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── outputs ───────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Outputs ({outputs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {outputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {run.status === 'completed'
                ? 'No outputs were persisted for this run.'
                : 'Run still in progress.'}
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {outputs.map((o) => (
                <div
                  key={o.id}
                  className="border border-gray-200 rounded-md overflow-hidden bg-gray-50"
                >
                  <a
                    href={o.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={o.publicUrl}
                      alt={o.slot}
                      className="w-full h-full object-contain"
                    />
                  </a>
                  <div className="p-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium">{o.slot}</p>
                      <p className="text-xs text-muted-foreground">
                        {(o.fileSize / 1024).toFixed(0)} KB · {o.mime}
                      </p>
                    </div>
                    <a href={o.publicUrl} download>
                      <Button variant="ghost" size="sm">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── steps timeline ────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Steps ({steps.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps recorded.</p>
          ) : (
            <ol className="space-y-2">
              {steps.map((s) => (
                <li key={s.id} className="flex items-start gap-3 text-sm">
                  <StatusIcon status={s.status} />
                  <div className="flex-1">
                    <p className="font-medium">{s.stepName}</p>
                    {s.outputs?.message && (
                      <p className="text-xs text-muted-foreground">
                        {s.outputs.message}
                      </p>
                    )}
                    {s.error && (
                      <p className="text-xs text-red-600">
                        {(s.error as { message?: string }).message ??
                          'unknown error'}
                      </p>
                    )}
                  </div>
                  {s.outputs?.cost_usd && (
                    <span className="text-xs text-muted-foreground">
                      ${s.outputs.cost_usd}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* ── error ─────────────────────────────────────────────── */}
      {run.error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-red-50 p-3 rounded overflow-auto">
              {JSON.stringify(run.error, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs rounded-full bg-orange-100 text-orange-700 px-2 py-0.5">
      {children}
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed')
    return <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />;
  if (status === 'failed')
    return <XCircle className="h-4 w-4 text-red-500 mt-0.5" />;
  if (status === 'skipped')
    return <PauseCircle className="h-4 w-4 text-gray-400 mt-0.5" />;
  return <Circle className="h-4 w-4 text-gray-400 mt-0.5 animate-pulse" />;
}
