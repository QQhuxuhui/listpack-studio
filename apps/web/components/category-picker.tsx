'use client';

import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import {
  CATEGORIES,
  type CategoryDef,
  getCategory,
} from '@/lib/compliance/category-guardrails';
import { useDictionary } from '@/lib/i18n/client';
import { Label } from '@/components/ui/label';

/**
 * Drop-in category selector with risk-aware UI.
 *
 * - Renders all categories in a single <select>, grouped by risk in the
 *   labels themselves (no <optgroup> — Safari styling is rough).
 * - Below the picker: a contextual banner for the *selected* category:
 *     supported → green check (no banner unless verbose=true)
 *     caution   → amber banner with the PRD-supplied reason
 *     blocked   → red banner + a hint that submit will be rejected
 * - Consumers should also gate their submit button on
 *   `isCategoryRunnable(value)` so the user gets a visual + server-side
 *   guard.
 */

interface Props {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  verbose?: boolean;
}

export function CategoryPicker({
  id = 'category',
  value,
  onChange,
  disabled,
  verbose = false,
}: Props) {
  const { t } = useDictionary();
  const selected = getCategory(value);

  return (
    <div>
      <Label htmlFor={id} className="mb-1">
        {t.category.label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
      >
        <option value="">{t.category.none}</option>
        {/* Show supported / caution / blocked in that order so the picker
            doesn't lead the user toward red-line picks. */}
        {(['supported', 'caution', 'blocked'] as const).flatMap((risk) =>
          CATEGORIES.filter((c) => c.risk === risk).map((c) => (
            <option key={c.id} value={c.id}>
              {labelFor(c, t.category)}
            </option>
          )),
        )}
      </select>

      {selected && <CategoryBanner cat={selected} verbose={verbose} t={t} />}
    </div>
  );
}

function labelFor(c: CategoryDef, t: ReturnType<typeof useDictionary>['t']['category']) {
  const tag =
    c.risk === 'blocked'
      ? ` · ⚠ ${t.risk_blocked.split('—')[0]?.trim()}`
      : c.risk === 'caution'
        ? ` · ${t.risk_caution}`
        : '';
  return `${c.displayName}${tag}`;
}

function CategoryBanner({
  cat,
  verbose,
  t,
}: {
  cat: CategoryDef;
  verbose: boolean;
  t: ReturnType<typeof useDictionary>['t'];
}) {
  if (cat.risk === 'supported') {
    if (!verbose) return null;
    return (
      <p className="mt-2 inline-flex items-center gap-1 text-xs text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> {t.category.risk_supported}
      </p>
    );
  }

  if (cat.risk === 'caution') {
    return (
      <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" /> {t.category.risk_caution}
        </div>
        <p className="text-xs mt-1 text-amber-800">{cat.reason}</p>
      </div>
    );
  }

  // blocked
  return (
    <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
      <div className="flex items-center gap-2 font-medium">
        <ShieldAlert className="h-4 w-4" /> {t.category.risk_blocked}
      </div>
      <p className="text-xs mt-1 text-red-800">{cat.reason}</p>
      <p className="text-xs mt-2 text-red-700 font-medium">
        {t.category.blocked_run_disabled}
      </p>
    </div>
  );
}
