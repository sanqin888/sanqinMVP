'use client';

import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Loader2,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '@/lib/api/client';
import type {
  AccountingSalesAnalyticsChannel,
  AccountingSalesAnalyticsReport,
  AccountingSalesProviderCoverageStatus,
} from '@/lib/contracts/accounting-sales';
import type { Locale } from '@/lib/i18n/locales';
import {
  formatMmDdYyyy,
  previousEqualRange,
  rangeForMode,
  shiftCalendarDate,
  type SalesAnalyticsDateRange,
} from './date-range';
import {
  assertContextReportIdentity,
  assertCoreReportIdentity,
  buildDailyRows,
  hasOwnerBackedEvidence,
} from './model';
import type {
  SalesAnalyticsBundle,
  SalesAnalyticsBusinessReport,
  SalesAnalyticsCalendarReport,
  SalesAnalyticsRangeMode,
  SalesAnalyticsWeatherCondition,
  SalesAnalyticsWeatherReport,
} from './types';

function money(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CA' : 'en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(cents / 100)
    .replace('CA$', '$');
}

function number(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
    maximumFractionDigits: 1,
  }).format(value);
}

function percentage(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
}

function deltaPercent(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function buildSalesUrl(
  storeStableId: string,
  range: SalesAnalyticsDateRange,
): string {
  const params = new URLSearchParams({
    storeStableId,
    from: range.from,
    to: range.to,
  });
  return `/accounting/report/sales?${params.toString()}`;
}

function buildReportUrl(
  path: '/reports/business' | '/reports/weather-history' | '/reports/calendar-context',
  storeStableId: string,
  range?: SalesAnalyticsDateRange,
): string {
  const params = new URLSearchParams({ storeStableId });
  if (range) {
    params.set('from', range.from);
    params.set('to', range.to);
  }
  return `${path}?${params.toString()}`;
}

function channelLabel(
  channel: AccountingSalesAnalyticsChannel,
  locale: Locale,
): string {
  const isZh = locale === 'zh';
  const labels: Record<AccountingSalesAnalyticsChannel, [string, string]> = {
    web: ['网站', 'Web'],
    in_store: ['店内 / POS', 'In-store / POS'],
    ubereats: ['Uber Eats', 'Uber Eats'],
    fantuan: ['饭团', 'Fantuan'],
    external: ['外部销售', 'External sales'],
    UNATTRIBUTED_PROVIDER: ['Provider 未归因', 'Unattributed provider'],
    UNATTRIBUTED: ['未归因', 'Unattributed'],
  };
  return labels[channel][isZh ? 0 : 1];
}

function coverageLabel(
  status: AccountingSalesProviderCoverageStatus,
  locale: Locale,
): string {
  const labels: Record<
    AccountingSalesProviderCoverageStatus,
    [string, string]
  > = {
    COMPLETE: ['完整', 'Complete'],
    INCOMPLETE: ['不完整', 'Incomplete'],
    UNKNOWN: ['未知', 'Unknown'],
    NOT_APPLICABLE: ['不适用', 'Not applicable'],
  };
  return labels[status][locale === 'zh' ? 0 : 1];
}

function weatherConditionLabel(
  condition: SalesAnalyticsWeatherCondition | null,
  locale: Locale,
): string {
  if (!condition) return '—';
  const labels: Record<SalesAnalyticsWeatherCondition, [string, string]> = {
    CLEAR: ['晴', 'Clear'],
    FAIR: ['晴间多云', 'Fair'],
    CLOUDY: ['多云', 'Cloudy'],
    OVERCAST: ['阴', 'Overcast'],
    FOG: ['雾', 'Fog'],
    RAIN: ['雨', 'Rain'],
    HEAVY_RAIN: ['大雨', 'Heavy rain'],
    FREEZING_RAIN: ['冻雨', 'Freezing rain'],
    SLEET: ['雨夹雪', 'Sleet'],
    SNOW: ['雪', 'Snow'],
    HAIL: ['冰雹', 'Hail'],
    THUNDERSTORM: ['雷暴', 'Thunderstorm'],
    STORM: ['风暴', 'Storm'],
  };
  return labels[condition][locale === 'zh' ? 0 : 1];
}

function presetLabel(mode: Exclude<SalesAnalyticsRangeMode, 'single'>): string {
  if (mode === '7d') return '7d';
  if (mode === '30d') return '30d';
  return '90d';
}

async function readOptionalContext<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path);
  } catch (cause) {
    console.error(cause);
    return null;
  }
}

export function SalesAnalyticsPageClient() {
  const { locale } = useParams<{ locale: Locale }>();
  const searchParams = useSearchParams();
  const isZh = locale === 'zh';
  const storeStableId = searchParams.get('store')?.trim() ?? '';

  const [rangeMode, setRangeMode] =
    useState<SalesAnalyticsRangeMode>('single');
  const [storeToday, setStoreToday] = useState<string | null>(null);
  const [singleDate, setSingleDate] = useState('');
  const [bundle, setBundle] = useState<SalesAnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [bootstrapRetryToken, setBootstrapRetryToken] = useState(0);
  const [nextDayState, setNextDayState] = useState<
    'IDLE' | 'CHECKING' | 'AVAILABLE' | 'UNAVAILABLE'
  >('IDLE');

  useEffect(() => {
    setRangeMode('single');
    setStoreToday(null);
    setSingleDate('');
    setBundle(null);
    setError(null);
    setNextDayState('IDLE');

    if (!storeStableId) {
      setBootstrapLoading(false);
      return;
    }

    let cancelled = false;
    setBootstrapLoading(true);

    void apiFetch<SalesAnalyticsBusinessReport>(
      buildReportUrl('/reports/business', storeStableId),
    )
      .then((report) => {
        if (cancelled) return;
        if (report.storeStableId !== storeStableId) {
          throw new Error('Store identity mismatch while resolving Store-local Today');
        }
        setStoreToday(report.range.to);
        setSingleDate(report.range.to);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        console.error(cause);
        setError(
          isZh
            ? '无法确定门店当前日期。请确认门店后重试。'
            : 'Unable to resolve the store-local current date. Confirm the store and retry.',
        );
      })
      .finally(() => {
        if (!cancelled) setBootstrapLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrapRetryToken, isZh, storeStableId]);

  const selectedRange = useMemo(() => {
    if (!storeToday || !singleDate) return null;
    return rangeForMode(rangeMode, storeToday, singleDate);
  }, [rangeMode, singleDate, storeToday]);

  useEffect(() => {
    if (!storeStableId || !selectedRange) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const salesPromise = apiFetch<AccountingSalesAnalyticsReport>(
      buildSalesUrl(storeStableId, selectedRange),
    );
    const businessPromise = apiFetch<SalesAnalyticsBusinessReport>(
      buildReportUrl('/reports/business', storeStableId, selectedRange),
    );
    const weatherPromise = readOptionalContext<SalesAnalyticsWeatherReport>(
      buildReportUrl('/reports/weather-history', storeStableId, selectedRange),
    );
    const calendarPromise = readOptionalContext<SalesAnalyticsCalendarReport>(
      buildReportUrl('/reports/calendar-context', storeStableId, selectedRange),
    );

    void Promise.all([
      salesPromise,
      businessPromise,
      weatherPromise,
      calendarPromise,
    ])
      .then(async ([sales, business, weather, calendar]) => {
        if (cancelled) return;

        assertCoreReportIdentity({
          storeStableId,
          from: selectedRange.from,
          to: selectedRange.to,
          sales,
          business,
        });

        if (weather) {
          assertContextReportIdentity({
            storeStableId,
            timezone: sales.timezone,
            from: selectedRange.from,
            to: selectedRange.to,
            report: weather,
          });
        }
        if (calendar) {
          assertContextReportIdentity({
            storeStableId,
            timezone: sales.timezone,
            from: selectedRange.from,
            to: selectedRange.to,
            report: calendar,
          });
        }

        const previousRange = previousEqualRange(selectedRange);
        let previousSales: AccountingSalesAnalyticsReport | null = null;
        if (
          previousRange &&
          previousRange.from >= sales.accountingStartDate
        ) {
          try {
            const previous = await apiFetch<AccountingSalesAnalyticsReport>(
              buildSalesUrl(storeStableId, previousRange),
            );
            if (
              previous.storeStableId === storeStableId &&
              previous.timezone === sales.timezone &&
              previous.from === previousRange.from &&
              previous.to === previousRange.to
            ) {
              previousSales = previous;
            }
          } catch (cause) {
            console.error(cause);
          }
        }

        if (cancelled) return;
        setBundle({
          sales,
          previousSales,
          business,
          weather,
          calendar,
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        console.error(cause);
        setBundle(null);
        setError(
          isZh
            ? '销售分析加载失败。门店、时区或日期证据可能不一致，请重试。'
            : 'Sales Analytics failed to load. Store, timezone, or date evidence may be inconsistent; retry.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isZh, refreshToken, selectedRange, storeStableId]);

  useEffect(() => {
    if (
      rangeMode !== 'single' ||
      !storeStableId ||
      !storeToday ||
      !singleDate ||
      !bundle
    ) {
      setNextDayState('IDLE');
      return;
    }

    const nextDate = shiftCalendarDate(singleDate, 1);
    if (nextDate > storeToday) {
      setNextDayState('UNAVAILABLE');
      return;
    }

    let cancelled = false;
    setNextDayState('CHECKING');
    const range = { from: nextDate, to: nextDate };

    void Promise.allSettled([
      apiFetch<AccountingSalesAnalyticsReport>(
        buildSalesUrl(storeStableId, range),
      ),
      apiFetch<SalesAnalyticsBusinessReport>(
        buildReportUrl('/reports/business', storeStableId, range),
      ),
    ]).then(([salesResult, businessResult]) => {
      if (cancelled) return;
      if (
        salesResult.status !== 'fulfilled' ||
        businessResult.status !== 'fulfilled'
      ) {
        setNextDayState('UNAVAILABLE');
        return;
      }

      const sales = salesResult.value;
      const business = businessResult.value;

      if (
        sales.storeStableId !== storeStableId ||
        sales.timezone !== bundle.sales.timezone ||
        sales.from !== nextDate ||
        sales.to !== nextDate ||
        business.storeStableId !== storeStableId ||
        business.timezone !== bundle.sales.timezone ||
        business.range.from !== nextDate ||
        business.range.to !== nextDate
      ) {
        setNextDayState('UNAVAILABLE');
        return;
      }

      setNextDayState(
        hasOwnerBackedEvidence(sales, business)
          ? 'AVAILABLE'
          : 'UNAVAILABLE',
      );
    });

    return () => {
      cancelled = true;
    };
  }, [bundle, rangeMode, singleDate, storeStableId, storeToday]);

  const dailyRows = useMemo(
    () =>
      bundle
        ? buildDailyRows({
            sales: bundle.sales,
            business: bundle.business,
            weather: bundle.weather,
            calendar: bundle.calendar,
          })
        : [],
    [bundle],
  );

  const previousRange = useMemo(
    () => (selectedRange ? previousEqualRange(selectedRange) : null),
    [selectedRange],
  );
  const chartData = useMemo(() => {
    const previousByDate = new Map(
      (bundle?.previousSales?.daily ?? []).map((row) => [row.date, row]),
    );
    return dailyRows.map((row, index) => {
      const previousDate = previousRange
        ? shiftCalendarDate(previousRange.from, index)
        : null;
      const previousRow = previousDate
        ? previousByDate.get(previousDate)
        : undefined;
      const previousValue =
        bundle?.previousSales && previousDate
          ? (previousRow?.summary.netSalesRevenueCents ?? 0) / 100
          : null;
      return {
        date: row.date.slice(5),
        [isZh ? '净销售收入' : 'Net sales revenue']:
          row.netSalesRevenueCents / 100,
        [isZh ? '等长前期净销售收入' : 'Previous-period net sales']:
          previousValue,
        [isZh ? '平均温度 °C' : 'Average temperature °C']:
          row.temperatureAvgC,
      };
    });
  }, [bundle?.previousSales, dailyRows, isZh, previousRange]);
  const previousSummary = bundle?.previousSales?.summary ?? null;
  const summary = bundle?.sales.summary ?? null;
  const businessSummary = bundle?.business.summary ?? null;
  const businessExpected = bundle?.business.comparison.expected ?? null;
  const leftDisabled =
    !bundle ||
    !singleDate ||
    singleDate <= bundle.sales.accountingStartDate ||
    loading;
  const rightDisabled =
    loading ||
    nextDayState === 'CHECKING' ||
    nextDayState !== 'AVAILABLE';

  const moveSingleDate = (offset: number) => {
    if (!singleDate) return;
    setRangeMode('single');
    setSingleDate(shiftCalendarDate(singleDate, offset));
  };

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-6 text-[#87362E]" aria-hidden="true" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                {isZh ? '销售分析' : 'Sales Analytics'}
              </h1>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              {isZh
                ? '财务金额来自 canonical Accounting Journal；订单、天气和节假日仅作为运营与解释性上下文，不重新定义收入，也不把相关性写成因果。'
                : 'Financial amounts come from the canonical Accounting Journal. Orders, weather, and holidays are operational or explanatory context only; they do not redefine revenue or turn correlation into causation.'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-mono text-slate-700">
                {storeStableId ||
                  (isZh ? '等待门店选择…' : 'Waiting for store selection…')}
              </span>
              {bundle ? (
                <>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
                    {bundle.sales.timezone}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
                    {bundle.sales.from === bundle.sales.to
                      ? bundle.sales.from
                      : `${bundle.sales.from} → ${bundle.sales.to}`}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setRefreshToken((current) => current + 1)}
            disabled={!storeStableId || loading || bootstrapLoading}
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
            {isZh ? '日期' : 'Date'}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div
              className={
                rangeMode === 'single'
                  ? 'inline-flex overflow-hidden rounded-xl border border-[#87362E] bg-white shadow-sm'
                  : 'inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white'
              }
            >
              <button
                type="button"
                aria-label={isZh ? '前一天' : 'Previous day'}
                disabled={leftDisabled}
                onClick={() => moveSingleDate(-1)}
                className="flex min-h-10 min-w-10 items-center justify-center border-r border-slate-200 text-slate-700 outline-none hover:bg-slate-50 focus-visible:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setRangeMode('single')}
                disabled={!singleDate}
                className={
                  rangeMode === 'single'
                    ? 'min-h-10 min-w-[132px] bg-[#87362E] px-3 py-2 text-sm font-semibold text-white outline-none'
                    : 'min-h-10 min-w-[132px] px-3 py-2 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-50'
                }
              >
                {singleDate ? formatMmDdYyyy(singleDate) : 'MM/DD/YYYY'}
              </button>
              <button
                type="button"
                aria-label={isZh ? '后一天' : 'Next day'}
                disabled={rightDisabled}
                onClick={() => moveSingleDate(1)}
                className="flex min-h-10 min-w-10 items-center justify-center border-l border-slate-200 text-slate-700 outline-none hover:bg-slate-50 focus-visible:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {nextDayState === 'CHECKING' ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>

            {(['7d', '30d', '90d'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={!storeToday}
                onClick={() => setRangeMode(mode)}
                className={
                  rangeMode === mode
                    ? 'min-h-10 rounded-xl bg-[#87362E] px-4 py-2 text-sm font-semibold text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#87362E]/30 focus-visible:ring-offset-2'
                    : 'min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 outline-none transition hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-40'
                }
              >
                {presetLabel(mode)}
              </button>
            ))}
          </div>
          {rangeMode === 'single' && nextDayState === 'UNAVAILABLE' && singleDate ? (
            <p className="mt-2 text-xs text-slate-500">
              {singleDate === storeToday
                ? isZh
                  ? '已到门店今天，不能继续向后。'
                  : 'This is the store-local current day; there is no later day to open.'
                : isZh
                  ? '后一天没有 canonical Sales 或订单证据，因此“>”已置灰。'
                  : 'The next day has no canonical Sales or Order evidence, so “>” is disabled.'}
            </p>
          ) : null}
        </div>
      </header>

      {!storeStableId ? (
        <Notice>
          {isZh
            ? '请先使用页面上方的“当前门店”选择器确定 storeStableId。销售分析不会使用隐式默认门店。'
            : 'Choose a Current store above first. Sales Analytics will not use an implicit default store.'}
        </Notice>
      ) : bootstrapLoading || loading ? (
        <section className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="text-center">
            <Loader2
              className="mx-auto size-7 animate-spin text-[#87362E]"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-slate-600">
              {isZh
                ? '正在组合 canonical Sales 与运营上下文…'
                : 'Joining canonical Sales with operating context…'}
            </p>
          </div>
        </section>
      ) : error ? (
        <section className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-red-200 bg-white p-6 text-center">
          <AlertCircle className="size-8 text-red-600" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold text-slate-950">
            {isZh ? '无法加载销售分析' : 'Unable to load Sales Analytics'}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() =>
              storeToday
                ? setRefreshToken((current) => current + 1)
                : setBootstrapRetryToken((current) => current + 1)
            }
            className="mt-4 min-h-10 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            {isZh ? '重试' : 'Retry'}
          </button>
        </section>
      ) : bundle && summary && businessSummary && businessExpected ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label={isZh ? '净销售收入' : 'Net sales revenue'}
              value={money(summary.netSalesRevenueCents, locale)}
              comparison={comparisonText({
                current: summary.netSalesRevenueCents,
                previous: previousSummary?.netSalesRevenueCents ?? null,
                locale,
                previousLabel: isZh ? '等长前期' : 'previous equal period',
              })}
            />
            <KpiCard
              label={isZh ? '订单量' : 'Orders'}
              value={number(businessSummary.orderCount, locale)}
              comparison={operatingComparisonText({
                current: businessSummary.orderCount,
                expected: businessExpected.orderCount,
                locale,
              })}
            />
            <KpiCard
              label={isZh ? '平均订单额' : 'Average order total'}
              value={money(businessSummary.averageOrderTotalCents, locale)}
              comparison={operatingComparisonText({
                current: businessSummary.averageOrderTotalCents,
                expected: businessExpected.averageOrderTotalCents,
                locale,
                moneyValue: true,
              })}
            />
            <KpiCard
              label={isZh ? '渠道贡献' : 'Channel contribution'}
              value={money(summary.contributionCents, locale)}
              comparison={comparisonText({
                current: summary.contributionCents,
                previous: previousSummary?.contributionCents ?? null,
                locale,
                previousLabel: isZh ? '等长前期' : 'previous equal period',
              })}
            />
            <KpiCard
              label={isZh ? '折扣' : 'Discounts'}
              value={money(summary.discountsCents, locale)}
              comparison={
                previousSummary
                  ? `${isZh ? '等长前期' : 'Previous equal period'} ${money(
                      previousSummary.discountsCents,
                      locale,
                    )}`
                  : isZh
                    ? '前期不可用'
                    : 'Prior period unavailable'
              }
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {isZh ? '销售 × 天气 × 节假日' : 'Sales × weather × holidays'}
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {isZh
                    ? '净销售收入使用 Accounting Journal；右轴温度与节假日标线仅用于解释上下文。'
                    : 'Net sales revenue uses the Accounting Journal; right-axis temperature and holiday markers are explanatory context only.'}
                </p>
              </div>
              {previousRange ? (
                <span className="text-xs text-slate-500">
                  {isZh ? '等长前期' : 'Previous equal period'}:{' '}
                  {bundle.previousSales
                    ? `${previousRange.from} → ${previousRange.to}`
                    : isZh
                      ? '超出覆盖或不可用'
                      : 'Outside coverage or unavailable'}
                </span>
              ) : null}
            </div>
            <div className="mt-4 h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="sales" />
                  <YAxis yAxisId="temp" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="sales"
                    type="monotone"
                    dataKey={isZh ? '净销售收入' : 'Net sales revenue'}
                  />
                  <Line
                    yAxisId="sales"
                    type="monotone"
                    dataKey={
                      isZh
                        ? '等长前期净销售收入'
                        : 'Previous-period net sales'
                    }
                  />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey={isZh ? '平均温度 °C' : 'Average temperature °C'}
                  />
                  {dailyRows
                    .filter((row) => row.isPublicHoliday === true)
                    .map((row) => (
                      <ReferenceLine
                        key={row.date}
                        yAxisId="sales"
                        x={row.date.slice(5)}
                        strokeDasharray="4 4"
                        label={
                          (isZh ? row.holidayNameZh : row.holidayNameEn) ??
                          (isZh ? '节假日' : 'Holiday')
                        }
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <DailyContextTable rows={dailyRows} locale={locale} />

          <section className="grid gap-4 xl:grid-cols-2">
            <ChannelTable report={bundle.sales} locale={locale} />
            <ItemTable report={bundle.business} locale={locale} />
          </section>

          <CoveragePanel bundle={bundle} locale={locale} />

          <p className="pb-2 text-right text-[11px] text-slate-400">
            {isZh ? '运营报表生成时间' : 'Operating report generated'}:{' '}
            {bundle.business.generatedAt}
          </p>
        </>
      ) : null}
    </div>
  );
}

function comparisonText(input: {
  current: number;
  previous: number | null;
  locale: Locale;
  previousLabel: string;
}): string {
  const { current, previous, locale, previousLabel } = input;
  if (previous === null) {
    return locale === 'zh' ? '前期不可用' : 'Prior period unavailable';
  }
  const delta = current - previous;
  const percent = deltaPercent(current, previous);
  const signedMoney = `${delta >= 0 ? '+' : '-'}${money(
    Math.abs(delta),
    locale,
  )}`;
  return `${previousLabel} ${money(previous, locale)} · ${signedMoney}${
    percent === null
      ? ''
      : ` (${new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
          style: 'percent',
          maximumFractionDigits: 1,
          signDisplay: 'always',
        }).format(percent)})`
  }`;
}

function operatingComparisonText(input: {
  current: number;
  expected: number;
  locale: Locale;
  moneyValue?: boolean;
}): string {
  const { current, expected, locale, moneyValue = false } = input;
  const delta = current - expected;
  const formattedExpected = moneyValue
    ? money(expected, locale)
    : number(expected, locale);
  const formattedDelta = moneyValue
    ? `${delta >= 0 ? '+' : '-'}${money(Math.abs(delta), locale)}`
    : new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
        maximumFractionDigits: 1,
        signDisplay: 'always',
      }).format(delta);
  return `${locale === 'zh' ? '同星期运营预期' : 'Same-weekday operating baseline'} ${formattedExpected} · ${formattedDelta}`;
}

function KpiCard({
  label,
  value,
  comparison,
}: {
  label: string;
  value: string;
  comparison: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{comparison}</p>
    </article>
  );
}

function DailyContextTable({
  rows,
  locale,
}: {
  rows: ReturnType<typeof buildDailyRows>;
  locale: Locale;
}) {
  const isZh = locale === 'zh';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <CloudSun className="size-5 text-[#87362E]" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-950">
          {isZh ? '逐日解释上下文' : 'Daily explanatory context'}
        </h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {isZh
          ? '“运营预期订单总额”是 Orders 运营指标，不是 Accounting 收入；天气与节假日也不代表因果。'
          : '“Operational expected order total” is an Orders operating measure, not Accounting revenue; weather and holidays do not prove causation.'}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="pb-2 pr-4">{isZh ? '日期' : 'Date'}</th>
              <th className="pb-2 pr-4">{isZh ? '节假日 / 长周末' : 'Holiday / long weekend'}</th>
              <th className="pb-2 pr-4 text-right">{isZh ? '净销售收入' : 'Net sales'}</th>
              <th className="pb-2 pr-4 text-right">{isZh ? '订单' : 'Orders'}</th>
              <th className="pb-2 pr-4 text-right">{isZh ? '平均订单额' : 'AOV'}</th>
              <th className="pb-2 pr-4 text-right">{isZh ? '运营预期订单总额' : 'Operational expected order total'}</th>
              <th className="pb-2 pr-4">{isZh ? '天气' : 'Weather'}</th>
              <th className="pb-2">{isZh ? '降水 / 积雪' : 'Rain / snow'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const holidayName = isZh ? row.holidayNameZh : row.holidayNameEn;
              const longWeekendName = isZh
                ? row.longWeekendNameZh
                : row.longWeekendNameEn;
              const context =
                row.isPublicHoliday === null
                  ? isZh
                    ? '日历不可用'
                    : 'Calendar unavailable'
                  : holidayName ??
                    (longWeekendName
                      ? `${longWeekendName} · ${isZh ? '长周末' : 'long weekend'}`
                      : '—');
              return (
                <tr key={row.date} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 font-medium text-slate-900">{row.date}</td>
                  <td className="py-3 pr-4 text-slate-600">{context}</td>
                  <td className="py-3 pr-4 text-right font-medium">{money(row.netSalesRevenueCents, locale)}</td>
                  <td className="py-3 pr-4 text-right">{number(row.orderCount, locale)}</td>
                  <td className="py-3 pr-4 text-right">{money(row.averageOrderTotalCents, locale)}</td>
                  <td className="py-3 pr-4 text-right text-slate-600">{money(row.operationalExpectedOrderTotalCents, locale)}</td>
                  <td className="py-3 pr-4 text-slate-600">
                    {row.temperatureAvgC === null
                      ? isZh
                        ? '天气不可用'
                        : 'Weather unavailable'
                      : `${weatherConditionLabel(row.weatherCondition, locale)} · ${number(row.temperatureAvgC, locale)}°C`}
                  </td>
                  <td className="py-3 text-slate-600">
                    {row.precipitationMm === null && row.snowDepthMm === null
                      ? '—'
                      : `${isZh ? '降水' : 'rain'} ${number(
                          row.precipitationMm ?? 0,
                          locale,
                        )} mm · ${isZh ? '积雪' : 'snow'} ${number(
                          row.snowDepthMm ?? 0,
                          locale,
                        )} mm`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ChannelTable({
  report,
  locale,
}: {
  report: AccountingSalesAnalyticsReport;
  locale: Locale;
}) {
  const isZh = locale === 'zh';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold text-slate-950">
        {isZh ? '渠道销售' : 'Sales by channel'}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {isZh
          ? '金额仍来自 Journal；channel 仅作为描述性归因。'
          : 'Amounts still come from the Journal; channel is descriptive attribution only.'}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr className="border-b">
              <th className="pb-2 pr-4">{isZh ? '渠道' : 'Channel'}</th>
              <th className="pb-2 pr-4 text-right">{isZh ? '净销售收入' : 'Net sales'}</th>
              <th className="pb-2 pr-4 text-right">{isZh ? '渠道贡献' : 'Contribution'}</th>
              <th className="pb-2 text-right">{isZh ? '分录' : 'Entries'}</th>
            </tr>
          </thead>
          <tbody>
            {report.byChannel.map((row) => (
              <tr key={row.key} className="border-b last:border-0">
                <td className="py-2 pr-4">{channelLabel(row.key, locale)}</td>
                <td className="py-2 pr-4 text-right">{money(row.summary.netSalesRevenueCents, locale)}</td>
                <td className="py-2 pr-4 text-right">{money(row.summary.contributionCents, locale)}</td>
                <td className="py-2 text-right">{row.journalEntryCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.byChannel.length ? (
          <p className="py-4 text-sm text-slate-500">
            {isZh ? '当前区间没有渠道归因。' : 'No channel attribution in this range.'}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ItemTable({
  report,
  locale,
}: {
  report: SalesAnalyticsBusinessReport;
  locale: Locale;
}) {
  const isZh = locale === 'zh';
  const rows = report.commercialItems.slice(0, 8);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold text-slate-950">
        {isZh ? '销售商品结构' : 'Commercial item mix'}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {isZh
          ? '商品数量来自 Orders Reporting，用于解释销售变化，不重算 Accounting 收入。'
          : 'Item quantities come from Orders Reporting to explain sales movement; they do not recompute Accounting revenue.'}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr className="border-b">
              <th className="pb-2 pr-4">{isZh ? '商品' : 'Item'}</th>
              <th className="pb-2 pr-4 text-right">{isZh ? '数量' : 'Qty'}</th>
              <th className="pb-2 pr-4 text-right">{isZh ? '订单数' : 'Orders'}</th>
              <th className="pb-2 pr-4 text-right">{isZh ? '渗透率' : 'Penetration'}</th>
              <th className="pb-2 text-right">{isZh ? '较运营预期' : 'Vs operating baseline'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.productStableId} className="border-b last:border-0">
                <td className="py-2 pr-4">{row.name}</td>
                <td className="py-2 pr-4 text-right">{number(row.quantity, locale)}</td>
                <td className="py-2 pr-4 text-right">{number(row.orderCount, locale)}</td>
                <td className="py-2 pr-4 text-right">{percentage(row.orderPenetrationRate, locale)}</td>
                <td className="py-2 text-right">
                  {new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
                    maximumFractionDigits: 1,
                    signDisplay: 'always',
                  }).format(row.deltaQuantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <p className="py-4 text-sm text-slate-500">
            {isZh ? '当前区间没有商品销售事实。' : 'No item sales facts in this range.'}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CoveragePanel({
  bundle,
  locale,
}: {
  bundle: SalesAnalyticsBundle;
  locale: Locale;
}) {
  const isZh = locale === 'zh';
  const weatherStatus = bundle.weather?.coverage.status ?? 'UNAVAILABLE';
  const calendarStatus = bundle.calendar?.coverage.status ?? 'UNAVAILABLE';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold text-slate-950">
        {isZh ? '证据覆盖与限制' : 'Evidence coverage & limitations'}
      </h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CoverageCard
          title={isZh ? '财务 Provider' : 'Financial providers'}
          status={coverageLabel(bundle.sales.providerCoverage.overall, locale)}
          detail={
            isZh
              ? 'INCOMPLETE / UNKNOWN 不会按 0 处理。'
              : 'INCOMPLETE / UNKNOWN is never treated as zero.'
          }
        />
        <CoverageCard
          title={isZh ? '天气' : 'Weather'}
          status={weatherStatus}
          detail={
            bundle.weather
              ? `${bundle.weather.coverage.availableDays}/${bundle.weather.coverage.requestedDays} ${isZh ? '天可用' : 'days available'}`
              : isZh
                ? '天气上下文请求失败；销售金额仍可使用。'
                : 'Weather context request failed; Sales money remains usable.'
          }
        />
        <CoverageCard
          title={isZh ? '节假日日历' : 'Holiday calendar'}
          status={calendarStatus}
          detail={
            bundle.calendar
              ? `${bundle.calendar.coverage.jurisdiction} · ${bundle.calendar.source.rulesetVersion}`
              : isZh
                ? '日历上下文请求失败；不会推断为“无节假日”。'
                : 'Calendar context request failed; it is not inferred as “no holiday”.'
          }
        />
        <CoverageCard
          title={isZh ? '营业历史' : 'Operating history'}
          status={bundle.business.coverage.storeOperatingContext}
          detail={
            isZh
              ? '历史营业时间 / 临时停业没有版本化，不能回填推断。'
              : 'Historical hours / temporary closures are not versioned and are not reconstructed.'
          }
        />
      </div>

      {bundle.weather ? (
        <p className="mt-4 text-[11px] leading-5 text-slate-400">
          {bundle.weather.source.attribution} · {bundle.weather.source.license} ·{' '}
          <a
            href={bundle.weather.source.licenseUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {isZh ? '许可' : 'license'}
          </a>{' '}
          · {bundle.weather.source.transformation}
        </p>
      ) : null}
      {bundle.calendar ? (
        <p className="mt-1 text-[11px] leading-5 text-slate-400">
          {isZh
            ? 'Ontario ESA public holiday 仅是日历分类，不表示门店一定关门；substitute holiday 在没有历史门店证据时不会推断。'
            : 'Ontario ESA public-holiday classification does not assert that the store was closed; substitute holidays are not inferred without historical store evidence.'}
        </p>
      ) : null}
    </section>
  );
}

function CoverageCard({
  title,
  status,
  detail,
}: {
  title: string;
  status: string;
  detail: string;
}) {
  return (
    <article className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{status}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      {children}
    </section>
  );
}
