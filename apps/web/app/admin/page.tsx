'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { RefreshCcw, Search } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/data-table';

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  planId: string;
  createdAt: string;
  deletedAt: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  subPlan: string | null;
  subStatus: string | null;
  subQuota: number | null;
  subUsed: number | null;
  overageEnabled: boolean | null;
  stripeCustomerId: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-gray-100 text-gray-700',
  paused: 'bg-amber-100 text-amber-700',
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const columns: ColumnDef<WorkspaceRow, unknown>[] = [
  {
    id: 'workspace',
    header: 'Workspace',
    accessorKey: 'name',
    cell: ({ row }) => (
      <>
        <div className="font-medium">{row.original.name}</div>
        <div className="text-xs text-muted-foreground">
          {row.original.slug}
          {row.original.deletedAt && (
            <span className="text-red-600 ml-2">deleted</span>
          )}
        </div>
      </>
    ),
  },
  {
    id: 'owner',
    header: 'Owner',
    accessorFn: (r) => `${r.ownerName ?? ''} ${r.ownerEmail ?? ''}`,
    cell: ({ row }) => (
      <>
        <div>{row.original.ownerName || '—'}</div>
        <div className="text-xs text-muted-foreground">
          {row.original.ownerEmail}
        </div>
      </>
    ),
  },
  {
    id: 'plan',
    header: 'Plan',
    accessorFn: (r) => r.subPlan ?? r.planId,
    cell: ({ row }) => (
      <code className="text-xs">{row.original.subPlan ?? row.original.planId}</code>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessorKey: 'subStatus',
    cell: ({ row }) => {
      const s = row.original.subStatus;
      if (!s) return null;
      return (
        <span
          className={`text-xs font-medium rounded-full px-2 py-0.5 ${
            STATUS_COLOR[s] ?? 'bg-gray-100 text-gray-700'
          }`}
        >
          {s}
        </span>
      );
    },
  },
  {
    id: 'usage',
    header: 'Usage',
    accessorFn: (r) => (r.subUsed ?? 0) / Math.max(r.subQuota ?? 1, 1),
    cell: ({ row }) =>
      row.original.subUsed != null && row.original.subQuota != null
        ? `${row.original.subUsed}/${row.original.subQuota}`
        : '—',
  },
  {
    id: 'overage',
    header: 'Overage',
    accessorKey: 'overageEnabled',
    cell: ({ row }) => (
      <span className="text-xs">{row.original.overageEnabled ? 'on' : 'off'}</span>
    ),
  },
  {
    id: 'created',
    header: 'Created',
    accessorKey: 'createdAt',
    cell: ({ row }) => (
      <span className="text-xs">
        {new Date(row.original.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

export default function AdminWorkspacesPage() {
  const { data, isLoading, mutate } = useSWR<{ workspaces: WorkspaceRow[] }>(
    '/api/admin/workspaces',
    fetcher,
  );
  const [q, setQ] = useState('');
  // `data?.workspaces ?? []` would be a fresh array literal each render
  // and re-trigger the useMemo below. Memoising on `data` keeps the
  // identity stable when SWR returns the cached payload.
  const rows = useMemo<WorkspaceRow[]>(
    () => data?.workspaces ?? [],
    [data],
  );

  // Pre-filter using stripe id + slug (tanstack's global filter uses the
  // visible accessor strings; adding a hidden join here keeps the search
  // box matching identifiers that aren't surfaced in any column.)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.name, r.slug, r.ownerEmail ?? '', r.stripeCustomerId ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, q]);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Workspaces</h1>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 w-64"
              placeholder="name, owner email, stripe id…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {isLoading
              ? 'Loading…'
              : `${filtered.length} of ${rows.length} workspaces · click headers to sort`}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <DataTable
            data={filtered}
            columns={columns}
            emptyMessage="No workspaces match the filter."
          />
        </CardContent>
      </Card>
    </section>
  );
}
