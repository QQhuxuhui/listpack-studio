'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { RefreshCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';

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

export default function AdminWorkspacesPage() {
  const { data, isLoading, mutate } = useSWR<{ workspaces: WorkspaceRow[] }>(
    '/api/admin/workspaces',
    fetcher,
  );
  const [q, setQ] = useState('');
  const rows = data?.workspaces ?? [];

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
              : `${filtered.length} of ${rows.length} workspaces`}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-gray-200">
              <tr>
                <th className="text-left py-2 pr-3">Workspace</th>
                <th className="text-left py-2 pr-3">Owner</th>
                <th className="text-left py-2 pr-3">Plan</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-right py-2 pr-3">Usage</th>
                <th className="text-left py-2 pr-3">Overage</th>
                <th className="text-left py-2 pr-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.slug}
                      {r.deletedAt && (
                        <span className="text-red-600 ml-2">deleted</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <div>{r.ownerName || '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.ownerEmail}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <code className="text-xs">{r.subPlan ?? r.planId}</code>
                  </td>
                  <td className="py-2 pr-3">
                    {r.subStatus && (
                      <span
                        className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                          STATUS_COLOR[r.subStatus] ??
                          'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {r.subStatus}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {r.subUsed != null && r.subQuota != null ? (
                      <>
                        {r.subUsed}/{r.subQuota}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {r.overageEnabled ? 'on' : 'off'}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}
