'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { PlayCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface RunRow {
  id: string;
  listingPackId: string;
  status: string;
  currentStep: string | null;
  costCapUsd: string | null;
  costSpentUsd: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  error: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
}

interface RunsResponse {
  runs: RunRow[];
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

export default function RecentRunsPage() {
  const { data, isLoading, mutate } = useSWR<RunsResponse>(
    '/api/workspace/runs',
    fetcher,
    { refreshInterval: 5000 },
  );
  const runs = data?.runs ?? [];

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg lg:text-2xl font-medium">Recent runs</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
          <Link href="/dashboard/runs/new">
            <Button size="sm">
              <PlayCircle className="h-4 w-4 mr-1" /> New run
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest 20 agent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No runs yet — start one from{' '}
              <Link href="/dashboard/runs/new" className="underline">
                New run
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {runs.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                          STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {r.status}
                      </span>
                      <Link
                        href={`/dashboard/runs/${r.id}`}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        {r.id.slice(0, 8)}…
                      </Link>
                      {r.currentStep && (
                        <span className="text-xs text-muted-foreground">
                          @ {r.currentStep}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Started{' '}
                      {r.startedAt
                        ? new Date(r.startedAt).toLocaleString()
                        : '—'}
                      {r.endedAt && (
                        <>
                          {' · ended '}
                          {new Date(r.endedAt).toLocaleString()}
                        </>
                      )}
                    </p>
                    {r.error && (
                      <p className="text-xs text-red-600 mt-1">
                        {(r.error as { message?: string }).message ??
                          'unknown error'}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>${Number(r.costSpentUsd).toFixed(4)} spent</p>
                    {r.costCapUsd && (
                      <p>cap ${Number(r.costCapUsd).toFixed(2)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
