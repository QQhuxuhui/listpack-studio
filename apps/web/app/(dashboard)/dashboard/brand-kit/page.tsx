'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Palette, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type BrandKit = {
  id: string;
  name: string;
  logoAssetId: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  tagline: string | null;
};

type Resp = { brandKit: BrandKit | null };

const fetcher = (url: string) =>
  fetch(url).then((res) => res.json() as Promise<Resp>);

export default function BrandKitPage() {
  const { data, isLoading, mutate } = useSWR<Resp>(
    '/api/workspace/brand-kit',
    fetcher,
  );
  const [name, setName] = useState('Default');
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [accent, setAccent] = useState('');
  const [fontFamily, setFontFamily] = useState('');
  const [tagline, setTagline] = useState('');
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<
    { kind: 'ok' | 'err'; text: string } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hydrate state from the server payload once it lands.
  useEffect(() => {
    if (data?.brandKit) {
      const k = data.brandKit;
      setName(k.name);
      setPrimary(k.primaryColor ?? '');
      setSecondary(k.secondaryColor ?? '');
      setAccent(k.accentColor ?? '');
      setFontFamily(k.fontFamily ?? '');
      setTagline(k.tagline ?? '');
      setLogoAssetId(k.logoAssetId);
      setLogoUrl(k.logoUrl);
    }
  }, [data]);

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.set('file', f);
      fd.set('type', 'brand_reference');
      const res = await fetch('/api/assets', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'err', text: body?.error ?? `HTTP ${res.status}` });
        return;
      }
      setLogoAssetId(body.id);
      setLogoUrl(body.publicUrl);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/workspace/brand-kit', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          logoAssetId,
          primaryColor: primary,
          secondaryColor: secondary,
          accentColor: accent,
          fontFamily,
          tagline,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'err', text: body?.error ?? `HTTP ${res.status}` });
        return;
      }
      setMessage({ kind: 'ok', text: 'Brand kit saved.' });
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-3xl">
      <h1 className="text-lg lg:text-2xl font-medium mb-2">Brand Kit</h1>
      <p className="text-sm text-muted-foreground mb-6">
        These values feed every scene + banner generation as guidance for the
        agent. Colours flow into the palette directive, the logo is offered
        for explicit placement, and the tagline shows up on banner-style
        outputs (Brand plan and above).
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              {data?.brandKit ? 'Edit your brand kit' : 'Create your brand kit'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSave} className="space-y-4">
              <div>
                <Label htmlFor="name">Kit name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div>
                <Label htmlFor="logo">Logo</Label>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={logoUrl}
                      alt="logo"
                      className="h-16 w-16 object-contain border border-gray-200 rounded bg-white"
                    />
                  ) : (
                    <div className="h-16 w-16 border border-dashed border-gray-300 rounded flex items-center justify-center text-xs text-gray-400">
                      No logo
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      id="logo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={onLogoChange}
                      disabled={uploading}
                      className="text-sm"
                    />
                    {logoAssetId && (
                      <button
                        type="button"
                        onClick={() => {
                          setLogoAssetId(null);
                          setLogoUrl(null);
                        }}
                        className="text-xs text-red-600 hover:underline self-start"
                      >
                        Remove logo
                      </button>
                    )}
                  </div>
                  {uploading && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <ColorField
                  id="primary"
                  label="Primary"
                  value={primary}
                  onChange={setPrimary}
                />
                <ColorField
                  id="secondary"
                  label="Secondary"
                  value={secondary}
                  onChange={setSecondary}
                />
                <ColorField
                  id="accent"
                  label="Accent"
                  value={accent}
                  onChange={setAccent}
                />
              </div>

              <div>
                <Label htmlFor="fontFamily">Font family</Label>
                <Input
                  id="fontFamily"
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  placeholder="e.g. Inter, Söhne, system-ui"
                  maxLength={100}
                />
              </div>

              <div>
                <Label htmlFor="tagline">Tagline</Label>
                <Input
                  id="tagline"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Used on banner outputs"
                  maxLength={200}
                />
              </div>

              {message && (
                <p
                  className={
                    message.kind === 'ok'
                      ? 'text-sm text-green-700'
                      : 'text-sm text-red-600'
                  }
                >
                  {message.text}
                </p>
              )}

              <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Save brand kit
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff';
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded border border-gray-200 cursor-pointer"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          maxLength={7}
          pattern="^#[0-9a-fA-F]{6}$"
        />
      </div>
    </div>
  );
}
