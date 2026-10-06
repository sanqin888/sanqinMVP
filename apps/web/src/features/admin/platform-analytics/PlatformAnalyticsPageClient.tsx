'use client';

import {
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type {
  AccountingPlatformAnalyticsAvailablePeriod,
  AccountingPlatformAnalyticsPeriod,
  AccountingPlatformAnalyticsProvider,
  AccountingPlatformAnalyticsReport,
} from '@/lib/contracts/accounting-platform-analytics';
import type { Locale } from '@/lib/i18n/locales';
import {
  orderedPlatformFeeCategoryKeys,
  platformCommissionName,
  platformFeeName,
} from './model';

function money(cents: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CA' : 'en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(cents / 100)
    .replace('CA$', '$');
}

function percent(bps: number | null, locale: Locale): string {
  if (bps === null) return '—';
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(bps / 10_000);
}

function monthLabel(month: string, locale: Locale): string {
  const parsed = new Date(`${month}-01T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return month;
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
    year: 'numeric',
    month: locale === 'zh' ? 'long' : 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

function providerLabel(provider: AccountingPlatformAnalyticsProvider['provider']) {
  return provider === 'UBER_EATS' ? 'Uber Eats' : 'Fantuan';
}

function coverageLabel(
  coverage: AccountingPlatformAnalyticsProvider['coverage'],
  isZh: boolean,
): string {
  if (coverage === 'COMPLETE') return isZh ? '三个月完整' : '3 months complete';
  if (coverage === 'PARTIAL') return isZh ? '数据不完整' : 'Coverage incomplete';
  return isZh ? '暂无已确认账单' : 'No confirmed statements';
}

function unavailableLabel(
  period: Exclude<
    AccountingPlatformAnalyticsPeriod,
    AccountingPlatformAnalyticsAvailablePeriod
  >,
  isZh: boolean,
): string {
  if (period.status === 'AMBIGUOUS') {
    return isZh ? '同月多份账单，需复核' : 'Multiple statements need review';
  }
  if (period.status === 'INCOMPLETE') {
    return isZh
      ? '账单明细未完整解析，请在财务端重新解析并确认'
      : 'Statement details are incomplete; re-evaluate and confirm in Accounting';
  }
  return isZh ? '缺少已确认账单' : 'Confirmed statement missing';
}

function CostValue({
  cents,
  bps,
  currency,
  locale,
}: {
  cents: number;
  bps: number | null;
  currency: string;
  locale: Locale;
}) {
  return (
    <div className="space-y-0.5 text-right">
      <div
        className={
          cents < 0
            ? 'font-semibold tabular-nums text-emerald-700'
            : 'font-semibold tabular-nums text-slate-900'
        }
      >
        {money(cents, currency, locale)}
      </div>
      <div className="text-xs tabular-nums text-slate-500">
        {percent(bps, locale)}
      </div>
    </div>
  );
}

function PeriodCell({
  period,
  isZh,
  children,
}: {
  period: AccountingPlatformAnalyticsPeriod;
  isZh: boolean;
  children: (available: AccountingPlatformAnalyticsAvailablePeriod) => ReactNode;
}) {
  if (period.status !== 'AVAILABLE') {
    return (
      <td className="min-w-40 px-3 py-3 text-right align-top text-xs text-amber-700">
        {unavailableLabel(period, isZh)}
      </td>
    );
  }
  return (
    <td className="min-w-40 px-3 py-3 text-right align-top">
      {children(period)}
    </td>
  );
}

function ProviderSection({
  provider,
  locale,
}: {
  provider: AccountingPlatformAnalyticsProvider;
  locale: Locale;
}) {
  const isZh = locale === 'zh';
  const feeKeys = orderedPlatformFeeCategoryKeys(provider);
  const commissionName =
    platformCommissionName(provider) ?? (isZh ? '佣金' : 'Commission');
  const latestPeriod = provider.periods[0] ?? null;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">
            {providerLabel(provider.provider)}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {provider.latestMonth
              ? isZh
                ? `最新已确认账单月份：${monthLabel(provider.latestMonth, locale)}`
                : `Latest confirmed statement month: ${monthLabel(provider.latestMonth, locale)}`
              : isZh
                ? '尚无已确认月度账单'
                : 'No confirmed monthly statement yet'}
          </p>
        </div>
        <span
          className={
            provider.coverage === 'COMPLETE'
              ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700'
              : provider.coverage === 'PARTIAL'
                ? 'rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700'
                : 'rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600'
          }
        >
          {coverageLabel(provider.coverage, isZh)}
        </span>
      </div>

      {latestPeriod?.status === 'AVAILABLE' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">
              {isZh ? '销售额 · 未税' : 'Sales · ex-tax'}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
              {money(latestPeriod.salesCents, latestPeriod.currency, locale)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">{commissionName}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
              {money(
                latestPeriod.commission.costImpactCents,
                latestPeriod.currency,
                locale,
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {isZh ? '占销售额 ' : 'Share of sales '}
              {percent(latestPeriod.commission.shareOfSalesBps, locale)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">
              {isZh ? '平台成本合计 · 未税' : 'Total platform cost · ex-tax'}
            </p>
            <p
              className={
                latestPeriod.totalPlatformCostExTaxCents < 0
                  ? 'mt-2 text-2xl font-semibold tabular-nums text-emerald-700'
                  : 'mt-2 text-2xl font-semibold tabular-nums text-slate-950'
              }
            >
              {money(
                latestPeriod.totalPlatformCostExTaxCents,
                latestPeriod.currency,
                locale,
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {isZh ? '占销售额 ' : 'Share of sales '}
              {percent(
                latestPeriod.totalPlatformCostShareOfSalesBps,
                locale,
              )}
            </p>
          </div>
        </div>
      ) : latestPeriod ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {unavailableLabel(latestPeriod, isZh)}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          {isZh
            ? '确认平台月度账单后，这里会自动显示最近三个月对比。'
            : 'The latest three-month comparison appears after monthly statements are confirmed.'}
        </div>
      )}

      {provider.periods.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[760px] w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-3 text-left font-medium">
                  {isZh ? '账单项目' : 'Statement category'}
                </th>
                {provider.periods.map((period) => (
                  <th
                    key={period.month}
                    className="px-3 py-3 text-right font-medium"
                  >
                    {monthLabel(period.month, locale)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3 py-3 font-medium text-slate-800">
                  {isZh ? 'Sales · 销售额（未税）' : 'Sales · ex-tax'}
                </td>
                {provider.periods.map((period) => (
                  <PeriodCell
                    key={period.month}
                    period={period}
                    isZh={isZh}
                  >
                    {(available) => (
                      <div className="font-semibold tabular-nums text-slate-900">
                        {money(
                          available.salesCents,
                          available.currency,
                          locale,
                        )}
                      </div>
                    )}
                  </PeriodCell>
                ))}
              </tr>

              <tr>
                <td className="px-3 py-3 font-medium text-slate-800">
                  {commissionName}
                </td>
                {provider.periods.map((period) => (
                  <PeriodCell
                    key={period.month}
                    period={period}
                    isZh={isZh}
                  >
                    {(available) => (
                      <CostValue
                        cents={available.commission.costImpactCents}
                        bps={available.commission.shareOfSalesBps}
                        currency={available.currency}
                        locale={locale}
                      />
                    )}
                  </PeriodCell>
                ))}
              </tr>

              {feeKeys.map((categoryKey) => (
                <tr key={categoryKey}>
                  <td className="px-3 py-3 font-medium text-slate-800">
                    {platformFeeName(provider, categoryKey)}
                  </td>
                  {provider.periods.map((period) => (
                    <PeriodCell
                      key={period.month}
                      period={period}
                      isZh={isZh}
                    >
                      {(available) => {
                        const fee = available.fees.find(
                          (candidate) =>
                            candidate.categoryKey === categoryKey,
                        );
                        return fee ? (
                          <CostValue
                            cents={fee.costImpactCents}
                            bps={fee.shareOfSalesBps}
                            currency={available.currency}
                            locale={locale}
                          />
                        ) : (
                          <span className="text-slate-400">—</span>
                        );
                      }}
                    </PeriodCell>
                  ))}
                </tr>
              ))}

              <tr className="bg-slate-50">
                <td className="px-3 py-3 font-semibold text-slate-950">
                  {isZh
                    ? '平台成本合计（未税）'
                    : 'Total platform cost · ex-tax'}
                </td>
                {provider.periods.map((period) => (
                  <PeriodCell
                    key={period.month}
                    period={period}
                    isZh={isZh}
                  >
                    {(available) => (
                      <CostValue
                        cents={available.totalPlatformCostExTaxCents}
                        bps={available.totalPlatformCostShareOfSalesBps}
                        currency={available.currency}
                        locale={locale}
                      />
                    )}
                  </PeriodCell>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export function PlatformAnalyticsPageClient() {
  const { locale } = useParams<{ locale: Locale }>();
  const searchParams = useSearchParams();
  const safeLocale: Locale = locale === 'zh' ? 'zh' : 'en';
  const isZh = safeLocale === 'zh';
  const storeStableId = searchParams.get('store')?.trim() ?? '';
  const [report, setReport] =
    useState<AccountingPlatformAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(Boolean(storeStableId));
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    setReport(null);
    setError(null);
    if (!storeStableId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const query = new URLSearchParams({ storeStableId });

    void apiFetch<AccountingPlatformAnalyticsReport>(
      `/accounting/report/platforms?${query.toString()}`,
    )
      .then((nextReport) => {
        if (cancelled) return;
        if (nextReport.storeStableId !== storeStableId) {
          throw new Error('Store identity mismatch in platform analytics');
        }
        setReport(nextReport);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshToken, storeStableId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">
            {isZh ? '平台分析' : 'Platform analytics'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {isZh
              ? '查看 Uber Eats 与 Fantuan 最近一次已确认月度账单，并与前两个自然月对比。'
              : 'Compare the latest confirmed Uber Eats and Fantuan monthly statements with the two prior calendar months.'}
          </p>
        </div>
        <button
          type="button"
          disabled={!storeStableId || loading}
          onClick={() => setRefreshToken((value) => value + 1)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          {isZh ? '刷新' : 'Refresh'}
        </button>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
        <strong>{isZh ? '未税口径' : 'Ex-tax basis'}</strong>
        <p className="mt-1">
          {isZh
            ? '销售额、佣金和平台费用均来自 Accounting 已确认账单的有效行；税额、Payout 与 Control Total 不计入。补贴和 Credit 作为平台成本抵减显示为负数。'
            : 'Sales, commission, and platform fees come from effective lines on confirmed Accounting statements. Taxes, payouts, and control totals are excluded. Subsidies and credits appear as negative platform cost.'}
        </p>
      </div>

      {!storeStableId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {isZh
            ? '请先从 Admin 顶部选择门店。'
            : 'Select a Store from the Admin header first.'}
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {isZh ? '正在读取已确认平台账单…' : 'Loading confirmed platform statements…'}
        </div>
      ) : null}

      {!loading && report
        ? report.providers.map((provider) => (
            <ProviderSection
              key={provider.provider}
              provider={provider}
              locale={safeLocale}
            />
          ))
        : null}
    </div>
  );
}
