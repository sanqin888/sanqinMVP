'use client';

import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/lib/i18n/locales';
import { apiFetch } from '@/lib/api/client';
import {
  inclusiveCalendarDays,
  shiftCalendarDate,
} from './formatters';
import { AttentionSummary, CoreMetrics } from './AttentionAndMetrics';
import {
  ChangeExplanation,
  ItemDemand,
} from './AttributionAndItems';
import { BusinessReportPaceChart } from './BusinessReportPaceChart';
import {
  CoverageAndLimitations,
  ExecutionHealth,
} from './ExecutionAndCoverage';
import type { BusinessOperationsReportView } from './types';

type RangeMode =
  | 'today'
  | 'yesterday'
  | '7d'
  | '28d'
  | '90d'
  | 'custom';

type DateRange = {
  from?: string;
  to?: string;
};

function presetRange(
  mode: RangeMode,
  storeToday: string | null,
  customFrom: string,
  customTo: string,
): DateRange | null {
  if (mode === 'today') return {};
  if (mode === 'custom') {
    return customFrom && customTo ? { from: customFrom, to: customTo } : null;
  }
  if (!storeToday) return null;
  if (mode === 'yesterday') {
    const date = shiftCalendarDate(storeToday, -1);
    return { from: date, to: date };
  }

  const days = mode === '7d' ? 7 : mode === '28d' ? 28 : 90;
  return {
    from: shiftCalendarDate(storeToday, -(days - 1)),
    to: storeToday,
  };
}

function rangeButtonLabel(mode: RangeMode, locale: Locale): string {
  const isZh = locale === 'zh';
  if (mode === 'today') return isZh ? '今天' : 'Today';
  if (mode === 'yesterday') return isZh ? '昨天' : 'Yesterday';
  if (mode === '7d') return '7d';
  if (mode === '28d') return '28d';
  if (mode === '90d') return '90d';
  return isZh ? '自定义' : 'Custom';
}

export function BusinessReportsPageClient() {
  const { locale } = useParams<{ locale: Locale }>();
  const searchParams = useSearchParams();
  const isZh = locale === 'zh';
  const storeStableId = searchParams.get('store')?.trim() ?? '';

  const [rangeMode, setRangeMode] = useState<RangeMode>('today');
  const [storeTodayAnchor, setStoreTodayAnchor] = useState<{
    storeStableId: string;
    date: string;
  } | null>(null);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [report, setReport] = useState<BusinessOperationsReportView | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(storeStableId));
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    setRangeMode('today');
    setStoreTodayAnchor(null);
    setCustomFrom('');
    setCustomTo('');
  }, [storeStableId]);

  const storeToday =
    storeTodayAnchor?.storeStableId === storeStableId
      ? storeTodayAnchor.date
      : null;

  const customError = useMemo(() => {
    if (rangeMode !== 'custom' || !customFrom || !customTo) return null;
    if (customFrom > customTo) {
      return isZh
        ? '开始日期不能晚于结束日期。'
        : 'The start date cannot be after the end date.';
    }
    if (inclusiveCalendarDays(customFrom, customTo) > 90) {
      return isZh
        ? '自定义区间最多 90 个自然日。'
        : 'Custom ranges are limited to 90 calendar days.';
    }
    if (storeToday && customTo > storeToday) {
      return isZh
        ? '结束日期不能晚于门店当前日期。'
        : 'The end date cannot be later than the store-local current date.';
    }
    return null;
  }, [customFrom, customTo, isZh, rangeMode, storeToday]);

  const selectedRange = useMemo(() => {
    if (customError) return null;
    return presetRange(rangeMode, storeToday, customFrom, customTo);
  }, [customError, customFrom, customTo, rangeMode, storeToday]);
  const selectedRangeReady = selectedRange !== null;
  const selectedFrom = selectedRange?.from ?? '';
  const selectedTo = selectedRange?.to ?? '';

  useEffect(() => {
    if (!storeStableId) {
      setLoading(false);
      setReport(null);
      setError(null);
      return;
    }

    if (!selectedRangeReady) {
      setLoading(false);
      setReport(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ storeStableId });
    if (selectedFrom) params.set('from', selectedFrom);
    if (selectedTo) params.set('to', selectedTo);

    void apiFetch<BusinessOperationsReportView>(
      `/reports/business?${params.toString()}`,
    )
      .then((nextReport) => {
        if (cancelled) return;
        setReport(nextReport);
        if (rangeMode === 'today') {
          setStoreTodayAnchor({
            storeStableId,
            date: nextReport.range.to,
          });
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        console.error(reason);
        setReport(null);
        setError(
          isZh
            ? '经营报表加载失败。请确认门店与日期后重试。'
            : 'Business Reports failed to load. Confirm the store and date range, then retry.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isZh,
    rangeMode,
    refreshToken,
    selectedFrom,
    selectedRangeReady,
    selectedTo,
    storeStableId,
  ]);

  const presetButtons: RangeMode[] = [
    'today',
    'yesterday',
    '7d',
    '28d',
    '90d',
    'custom',
  ];

  return (
    <main className="mx-auto w-full max-w-[1680px] space-y-5 px-4 py-5 sm:px-6 sm:py-6 xl:px-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-6 text-[#87362E]" aria-hidden="true" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                {isZh ? '经营报表' : 'Business Reports'}
              </h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {isZh
                ? 'Today-first：先看今天有没有异常，再定位异常在哪里、为什么变化，最后查看明细证据。'
                : 'Today-first: see whether anything needs attention, locate where it moved, understand why, then inspect the evidence.'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-mono text-slate-700">
                {storeStableId ||
                  (isZh ? '等待门店选择…' : 'Waiting for store selection…')}
              </span>
              {report ? (
                <>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
                    {report.timezone}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
                    {report.range.from === report.range.to
                      ? report.range.from
                      : `${report.range.from} → ${report.range.to}`}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setRefreshToken((current) => current + 1)}
            disabled={!storeStableId || loading}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#87362E]/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`size-4 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {isZh ? '刷新' : 'Refresh'}
          </button>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <CalendarDays className="size-4" aria-hidden="true" />
            {isZh ? '日期区间' : 'Date range'}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {presetButtons.map((mode) => {
              const requiresAnchor =
                mode !== 'today' && mode !== 'custom';
              const disabled = requiresAnchor && !storeToday;
              const active = rangeMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={disabled}
                  onClick={() => setRangeMode(mode)}
                  className={
                    active
                      ? 'min-h-10 rounded-xl bg-[#87362E] px-3 py-2 text-sm font-semibold text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#87362E]/30 focus-visible:ring-offset-2'
                      : 'min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 outline-none transition hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-40'
                  }
                >
                  {rangeButtonLabel(mode, locale)}
                </button>
              );
            })}
          </div>

          {rangeMode === 'custom' ? (
            <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 lg:max-w-xl">
              <label className="text-xs font-medium text-slate-700">
                {isZh ? '开始日期' : 'From'}
                <input
                  type="date"
                  value={customFrom}
                  max={storeToday ?? undefined}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#87362E] focus:ring-2 focus:ring-[#87362E]/15"
                />
              </label>
              <label className="text-xs font-medium text-slate-700">
                {isZh ? '结束日期' : 'To'}
                <input
                  type="date"
                  value={customTo}
                  max={storeToday ?? undefined}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#87362E] focus:ring-2 focus:ring-[#87362E]/15"
                />
              </label>
              {customError ? (
                <p className="text-xs text-red-700 sm:col-span-2">
                  {customError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {!storeStableId ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {isZh
            ? '请先使用页面上方的“当前门店”选择器确定 storeStableId。经营报表不会使用隐式默认门店。'
            : 'Choose a Current store above first. Business Reports will not use an implicit default store.'}
        </section>
      ) : loading ? (
        <section className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="text-center">
            <Loader2
              className="mx-auto size-7 animate-spin text-[#87362E]"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-slate-600">
              {isZh
                ? '正在生成门店经营监控…'
                : 'Building the store operating view…'}
            </p>
          </div>
        </section>
      ) : error ? (
        <section className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-red-200 bg-white p-6 text-center">
          <AlertCircle className="size-8 text-red-600" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold text-slate-950">
            {isZh ? '无法加载经营报表' : 'Unable to load Business Reports'}
          </h2>
          <p className="mt-1 max-w-lg text-sm text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => setRefreshToken((current) => current + 1)}
            className="mt-4 min-h-10 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            {isZh ? '重试' : 'Retry'}
          </button>
        </section>
      ) : report ? (
        <>
          <AttentionSummary report={report} locale={locale} />
          <CoreMetrics report={report} locale={locale} />
          <BusinessReportPaceChart report={report} locale={locale} />
          <ChangeExplanation report={report} locale={locale} />
          <ItemDemand report={report} locale={locale} />
          <ExecutionHealth report={report} locale={locale} />
          <CoverageAndLimitations report={report} locale={locale} />
          <p className="pb-2 text-right text-[11px] text-slate-400">
            {isZh ? '生成时间' : 'Generated'}: {report.generatedAt}
          </p>
        </>
      ) : rangeMode === 'custom' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          {isZh
            ? '请选择完整且有效的自定义日期区间。'
            : 'Choose a complete, valid custom date range.'}
        </section>
      ) : null}
    </main>
  );
}
