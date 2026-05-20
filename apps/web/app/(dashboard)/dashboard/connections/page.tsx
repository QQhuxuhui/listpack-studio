'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Plug, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ShopifyConnection {
  id: string;
  shop: string;
  scopes: string | null;
  connectedAt: string;
  metadata: Record<string, unknown> | null;
}

interface ConnectionsResponse {
  shopify: ShopifyConnection[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ConnectionsPage() {
  const { data, isLoading } = useSWR<ConnectionsResponse>(
    '/api/workspace/connections',
    fetcher,
  );
  const [shopInput, setShopInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const shopify = data?.shopify ?? [];

  function startConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleaned = shopInput.trim().toLowerCase();
    if (!cleaned) {
      setError('Enter a shop domain.');
      return;
    }
    // Accept either "store" or "store.myshopify.com"; normalise to the latter.
    const shop = cleaned.endsWith('.myshopify.com')
      ? cleaned
      : `${cleaned}.myshopify.com`;
    if (!/^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(shop)) {
      setError('Invalid shop domain. Use e.g. my-store.myshopify.com');
      return;
    }
    window.location.href = `/api/shopify/oauth/authorize?shop=${encodeURIComponent(shop)}`;
  }

  async function disconnect(id: string) {
    if (!confirm('Disconnect this Shopify store?')) return;
    const res = await fetch(`/api/shopify/connections/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      alert('Failed to disconnect. Please try again.');
      return;
    }
    mutate('/api/workspace/connections');
  }

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-4xl">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">
        Platform Connections
      </h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4" /> Connect a Shopify store
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={startConnect} className="space-y-3">
            <div>
              <Label htmlFor="shop" className="mb-2">
                Shop domain
              </Label>
              <Input
                id="shop"
                name="shop"
                placeholder="my-store.myshopify.com"
                value={shopInput}
                onChange={(e) => setShopInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                You'll be redirected to Shopify to approve the install. The
                redirect comes back here.
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit">
              Connect Shopify
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected stores</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shopify.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Shopify stores connected yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shopify.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium">{c.shop}</p>
                    <p className="text-xs text-muted-foreground">
                      Connected{' '}
                      {new Date(c.connectedAt).toLocaleDateString()} ·{' '}
                      {c.scopes ?? 'unknown scopes'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnect(c.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
