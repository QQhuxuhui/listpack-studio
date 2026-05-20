'use client';

import {
  type ChangeEvent,
  type FormEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategoryPicker } from '@/components/category-picker';
import { isCategoryRunnable } from '@/lib/compliance/category-guardrails';

type Platform = 'amazon' | 'shopify' | 'ebay' | 'temu' | 'shein';

type RuleResult = {
  rule_key: string;
  severity: 'block' | 'warn' | 'info';
  passed: boolean;
  evidence: Record<string, unknown>;
  display_title: { en: string; zh?: string };
  display_message: { en: string; zh?: string };
  fix_action: string | null;
  source_url: string | null;
};

type FixSuggestion = {
  /** Detector type that flagged the rule — e.g. "background_color". */
  rule_key?: string;
  /** Fixer to apply — e.g. "whiten_background". */
  type: string;
  /** Fixer-specific parameters (tolerances, target dimensions, etc.). */
  spec?: Record<string, unknown>;
};

type ComplianceReport = {
  target_platform: Platform;
  target_category: string | null;
  overall: 'pass' | 'warn' | 'fail';
  rule_results: RuleResult[];
  fix_suggestions: FixSuggestion[];
  rule_set_version: number;
};

type AutoFixResult = {
  image_base64: string;
  mime: string;
  size_bytes: number;
  applied: Array<{ type: string; metadata: Record<string, unknown> }>;
};

const PLATFORMS: Platform[] = ['amazon', 'shopify', 'ebay', 'temu', 'shein'];

export default function CompliancePage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>('amazon');
  const [category, setCategory] = useState<string>('');
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setReport(null);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setPending(true);
    setError(null);
    setReport(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('target_platform', platform);
      if (category) fd.append('target_category', category);

      const res = await fetch('/api/agent/compliance/check', {
        method: 'POST',
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? `HTTP ${res.status}`);
      } else {
        setReport(body as ComplianceReport);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    } finally {
      setPending(false);
    }
  }

  const grouped = useMemo(() => {
    if (!report) return { failed: [], warn: [], passed: [] };
    return report.rule_results.reduce(
      (acc, r) => {
        if (!r.passed) {
          if (r.severity === 'block') acc.failed.push(r);
          else acc.warn.push(r);
        } else acc.passed.push(r);
        return acc;
      },
      { failed: [] as RuleResult[], warn: [] as RuleResult[], passed: [] as RuleResult[] },
    );
  }, [report]);

  // ── auto-fix state ────────────────────────────────────────────
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<AutoFixResult | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);

  async function applyFixes() {
    if (!file || !report) return;
    setFixError(null);
    setFixResult(null);
    setFixing(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('actions', JSON.stringify(report.fix_suggestions ?? []));
      const res = await fetch('/api/agent/compliance/auto-fix', {
        method: 'POST',
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) {
        setFixError(body?.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      setFixResult(body as AutoFixResult);
    } catch (err) {
      setFixError((err as Error).message);
    } finally {
      setFixing(false);
    }
  }

  async function recheckWithFixed() {
    if (!fixResult) return;
    const bin = Uint8Array.from(atob(fixResult.image_base64), (c) =>
      c.charCodeAt(0),
    );
    const blob = new Blob([bin], { type: fixResult.mime });
    const ext = fixResult.mime.split('/')[1] ?? 'png';
    const fixedFile = new File([blob], `fixed.${ext}`, { type: fixResult.mime });
    // Set as the working file so the next "Run compliance check" hits it.
    setFile(fixedFile);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(fixedFile));
    setReport(null);
    setFixResult(null);
  }

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <header>
        <h1 className="text-lg lg:text-2xl font-medium">Compliance Check</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a product image, pick a target platform + category, and see
          every rule it would trip on Amazon / Shopify / Temu / SHEIN / eBay before
          the marketplace ever sees it.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="file">Image (JPEG / PNG / WebP, max 20 MB)</Label>
              <Input
                ref={fileInputRef}
                id="file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/tiff,image/gif"
                onChange={onFileChange}
                disabled={pending}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="platform">Target platform</Label>
                <select
                  id="platform"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform)}
                  disabled={pending}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <CategoryPicker
                  value={category}
                  onChange={setCategory}
                  disabled={pending}
                />
              </div>
            </div>

            {previewUrl && (
              <div className="mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="preview"
                  className="max-h-64 rounded border border-gray-200"
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={pending || !file}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking…
                </>
              ) : (
                'Run compliance check'
              )}
            </Button>
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </form>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {report.overall === 'pass' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Pass
                </>
              ) : report.overall === 'warn' ? (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  Warnings
                </>
              ) : (
                <>
                  <ShieldAlert className="h-5 w-5 text-red-500" />
                  Will be rejected
                </>
              )}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {report.target_platform}
                {report.target_category && ` · ${report.target_category}`} · rule
                set v{report.rule_set_version}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {grouped.failed.length > 0 && (
              <Section
                title={`Blocking failures (${grouped.failed.length})`}
                colour="red"
                rules={grouped.failed}
              />
            )}
            {grouped.warn.length > 0 && (
              <Section
                title={`Warnings (${grouped.warn.length})`}
                colour="amber"
                rules={grouped.warn}
              />
            )}
            <Section
              title={`Passed (${grouped.passed.length})`}
              colour="green"
              rules={grouped.passed}
              collapsedByDefault
            />

            {report.fix_suggestions.length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Auto-fix ({report.fix_suggestions.length} available)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Apply pre-configured fixers in order (whitens
                      background, crops fill, removes detected text, etc.).
                      The fixed image opens in the preview — re-run the
                      check to verify.
                    </p>
                    <ul className="text-xs text-muted-foreground mt-2 list-disc pl-4">
                      {report.fix_suggestions.map((s, i) => (
                        <li key={i}>
                          <code>{s.type}</code>
                          {s.rule_key && (
                            <span className="text-gray-400"> · {s.rule_key}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    type="button"
                    onClick={applyFixes}
                    disabled={fixing || !file}
                    className="bg-orange-500 hover:bg-orange-600 text-white shrink-0"
                  >
                    {fixing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Applying…
                      </>
                    ) : (
                      `Apply ${report.fix_suggestions.length} fixes`
                    )}
                  </Button>
                </div>
                {fixError && (
                  <p className="text-sm text-red-600">{fixError}</p>
                )}
                {fixResult && (
                  <div className="space-y-3 mt-2">
                    <div className="flex flex-wrap gap-3 items-start">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Before
                        </p>
                        {previewUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={previewUrl}
                            alt="before"
                            className="max-h-48 rounded border border-gray-200"
                          />
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          After ({fixResult.applied.length} applied,{' '}
                          {(fixResult.size_bytes / 1024).toFixed(0)} KB)
                        </p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`data:${fixResult.mime};base64,${fixResult.image_base64}`}
                          alt="after"
                          className="max-h-48 rounded border border-gray-200"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a
                        download={`fixed.${fixResult.mime.split('/')[1] ?? 'png'}`}
                        href={`data:${fixResult.mime};base64,${fixResult.image_base64}`}
                      >
                        <Button type="button" variant="outline" size="sm">
                          Download fixed
                        </Button>
                      </a>
                      <Button
                        type="button"
                        size="sm"
                        onClick={recheckWithFixed}
                      >
                        Re-check with fixed image
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function Section({
  title,
  rules,
  colour,
  collapsedByDefault = false,
}: {
  title: string;
  rules: RuleResult[];
  colour: 'red' | 'amber' | 'green';
  collapsedByDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const accent =
    colour === 'red'
      ? 'border-red-300 bg-red-50'
      : colour === 'amber'
      ? 'border-amber-300 bg-amber-50'
      : 'border-green-300 bg-green-50';

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-sm font-semibold text-gray-800 mb-2 hover:text-orange-600"
      >
        {expanded ? '▾' : '▸'} {title}
      </button>
      {expanded && (
        <ul className="space-y-2">
          {rules.map((r) => (
            <li
              key={r.rule_key}
              className={`border ${accent} rounded p-3 text-sm`}
            >
              <div className="flex items-baseline justify-between gap-4">
                <strong>{r.display_title.zh || r.display_title.en}</strong>
                <code className="text-xs text-muted-foreground">{r.rule_key}</code>
              </div>
              <p className="text-muted-foreground mt-1">
                {r.display_message.zh || r.display_message.en}
              </p>
              {r.fix_action && (
                <p className="text-xs mt-2">
                  <span className="font-medium">Auto-fix:</span>{' '}
                  <code>{r.fix_action}</code>
                </p>
              )}
              {!r.passed && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer">
                    Evidence
                  </summary>
                  <pre className="text-xs bg-white border border-gray-200 rounded p-2 mt-1 overflow-auto max-h-48">
                    {JSON.stringify(r.evidence, null, 2)}
                  </pre>
                </details>
              )}
              {r.source_url && (
                <a
                  href={r.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-orange-600 hover:underline mt-2 inline-block"
                >
                  Source policy →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
