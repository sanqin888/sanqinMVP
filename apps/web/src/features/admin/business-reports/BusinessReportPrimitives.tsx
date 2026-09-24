import type { ReactNode } from 'react';
import type { Locale } from '@/lib/i18n/locales';
import { confidenceLabel } from './formatters';
import type { BusinessReportConfidence } from './types';

export function ConfidenceBadge({
  confidence,
  locale,
}: {
  confidence: BusinessReportConfidence;
  locale: Locale;
}) {
  const classes =
    confidence === 'SUFFICIENT'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : confidence === 'LOW_SAMPLE'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-sky-200 bg-sky-50 text-sky-700';

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${classes}`}
    >
      {confidenceLabel(confidence, locale)}
    </span>
  );
}

export function SmallFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export function CoverageCard({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {title}
        </p>
      </div>
      <p className="mt-2 break-words text-sm font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}
