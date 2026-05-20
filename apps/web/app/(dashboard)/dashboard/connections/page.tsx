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
import { useDictionary } from '@/lib/i18n/client';

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
  const { t } = useDictionary();
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
      setError(t.connections.shop_help);
      return;
    }
    // Accept either "store" or "store.myshopify.com"; normalise to the latter.
    const shop = cleaned.endsWith('.myshopify.com')
      ? cleaned
      : `${cleaned}.myshopify.com`;
    if (!/^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(shop)) {
      setError(t.connections.invalid_shop);
      return;
    }
    window.location.href = `/api/shopify/oauth/authorize?shop=${encodeURIComponent(shop)}`;
  }

  async function disconnect(id: string) {
    if (!confirm(t.connections.confirm_disconnect)) return;
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
        {t.connections.h1}
      </h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4" /> {t.connections.connect_shopify_h}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={startConnect} className="space-y-3">
            <div>
              <Label htmlFor="shop" className="mb-2">
                {t.connections.shop_label}
              </Label>
              <Input
                id="shop"
                name="shop"
                placeholder={t.connections.shop_placeholder}
                value={shopInput}
                onChange={(e) => setShopInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t.connections.shop_help}
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit">
              {t.connections.connect_btn}
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.connections.connected_h}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t.common.loading}</p>
          ) : shopify.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.connections.none_yet}
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
                      {new Date(c.connectedAt).toLocaleDateString()} ·{' '}
                      {c.scopes ?? '—'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnect(c.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> {t.connections.disconnect}
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
