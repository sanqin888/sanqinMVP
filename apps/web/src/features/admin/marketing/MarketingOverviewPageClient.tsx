'use client';

import { Activity, CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  StaffEmptyState,
  StaffFeedback,
  StaffPage,
  StaffPageHeader,
  StaffPanel,
  StaffStat,
} from '@/components/staff/StaffPrimitives';
import {
  MarketingOverviewCampaignTable,
  WINDOW_KEYS,
  windowLabel,
  type MarketingActivity,
  type WindowKey,
} from '@/features/admin/marketing/MarketingOverviewCampaignTable';
import { apiFetch } from '@/lib/api/client';
import type { Locale } from '@/lib/i18n/locales';

type MarketingOverviewReport = {
  version: 1;
  storeStableId: string;
  timezone: string;
  generatedAt: string;
  windows: Record<
    WindowKey,
    {
      fromInclusive: string;
      toExclusive: string;
    }
  >;
  activities: MarketingActivity[];
  coverage: {
    unattributedCouponUsesInLast90Days: number;
  };
};

function formatGeneratedAt(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function MarketingOverviewPageClient() {
  const { locale } = useParams<{ locale: Locale }>();
  const searchParams = useSearchParams();
  const safeLocale: Locale = locale === 'zh' ? 'zh' : 'en';
  const isZh = safeLocale === 'zh';
  const storeStableId = searchParams.get('store')?.trim() ?? '';

  const [report, setReport] = useState<MarketingOverviewReport | null>(null);
  const [loading, setLoading] = useState(Boolean(storeStableId));
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!storeStableId) {
      setReport(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ storeStableId });
    void apiFetch<MarketingOverviewReport>(
      `/reports/marketing?${params.toString()}`,
    )
      .then((nextReport) => {
        if (!cancelled) setReport(nextReport);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        console.error(reason);
        setReport(null);
        setError(
          isZh
            ? '营销总览加载失败。请确认当前门店后重试。'
            : 'Marketing Overview failed to load. Confirm the current store and retry.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isZh, refreshToken, storeStableId]);

  const totals = useMemo<Record<WindowKey, number>>(() => {
    const totalFor = (key: WindowKey) =>
      report?.activities.reduce(
        (sum, activity) => sum + activity.metrics[key].uses,
        0,
      ) ?? 0;

    return {
      today: totalFor('today'),
      last7Days: totalFor('last7Days'),
      last30Days: totalFor('last30Days'),
      last90Days: totalFor('last90Days'),
    };
  }, [report]);

  const topLevelCampaignCount = useMemo(() => {
    if (!report) return 0;
    const dailySpecialCount = report.activities.some(
      (activity) => activity.kind === 'DAILY_SPECIAL',
    )
      ? 1
      : 0;
    return (
      report.activities.filter((activity) => activity.kind !== 'DAILY_SPECIAL')
        .length + dailySpecialCount
    );
  }, [report]);

  return (
    <StaffPage>
      <StaffPageHeader
        eyebrow={isZh ? '营销' : 'Marketing'}
        title={isZh ? '营销总览' : 'Marketing overview'}
        description={
          isZh
            ? '按当前门店查看正在进行的商品特价、优惠券礼包和自动 / 积分活动，并同时查看使用次数、关联件数、实际优惠与关联销售。历史证据不完整时会明确显示覆盖状态。'
            : 'Monitor ongoing item specials, coupon programs, and automatic or loyalty campaigns for the current store, including uses, associated item quantity, actual discount, and associated sales. Historical evidence gaps are shown explicitly.'
        }
        actions={
          <button
            type="button"
            onClick={() => setRefreshToken((current) => current + 1)}
            disabled={!storeStableId || loading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#87362E]/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`size-4 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {isZh ? '刷新' : 'Refresh'}
          </button>
        }
      />

      {!storeStableId ? (
        <StaffEmptyState
          icon={<Activity className="size-5" aria-hidden="true" />}
          title={isZh ? '请先选择门店' : 'Select a store first'}
          description={
            isZh
              ? '使用页面上方的“当前门店”选择器后，营销总览才会读取该门店的活动使用情况。'
              : 'Choose a Current store above before loading its marketing activity.'
          }
        />
      ) : loading ? (
        <StaffPanel className="flex min-h-64 items-center justify-center p-6">
          <div className="text-center">
            <Loader2
              className="mx-auto size-7 animate-spin text-[#87362E]"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-slate-600">
              {isZh ? '正在生成营销总览…' : 'Building Marketing Overview…'}
            </p>
          </div>
        </StaffPanel>
      ) : error ? (
        <StaffFeedback tone="danger">{error}</StaffFeedback>
      ) : report ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {WINDOW_KEYS.map((key) => (
              <StaffStat
                key={key}
                label={windowLabel(key, isZh)}
                value={totals[key].toLocaleString()}
                detail={
                  isZh
                    ? '活动使用次数；同一订单可同时计入多个活动'
                    : 'Campaign uses; one order may count toward multiple campaigns'
                }
              />
            ))}
          </div>

          <StaffFeedback tone="neutral">
            {isZh
              ? '口径提示：关联销售是“使用该活动的订单商品销售额”，不是活动带来的增量收入；同一订单可能关联多个活动，因此不能跨活动相加得到营业额。PARTIAL 表示只展示有可靠证据部分的小计，UNAVAILABLE 不会被当作 0。'
              : 'Metric note: associated sales are merchandise sales on orders that used the campaign, not incremental revenue. One order may be associated with multiple campaigns, so values must not be summed across campaigns as business sales. PARTIAL shows only the evidence-covered subtotal; UNAVAILABLE is never treated as zero.'}
          </StaffFeedback>

          <StaffPanel className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarDays
                    className="size-5 text-[#87362E]"
                    aria-hidden="true"
                  />
                  <h2 className="text-lg font-semibold text-slate-950">
                    {isZh ? '当前活动' : 'Current campaigns'}
                  </h2>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {isZh
                    ? `共 ${topLevelCampaignCount} 个进行中活动 · ${report.timezone}`
                    : `${topLevelCampaignCount} ongoing campaigns · ${report.timezone}`}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                {isZh ? '更新于 ' : 'Updated '}
                {formatGeneratedAt(report.generatedAt, safeLocale)}
              </p>
            </div>

            {report.coverage.unattributedCouponUsesInLast90Days > 0 ? (
              <StaffFeedback tone="warning" className="mt-4">
                {isZh
                  ? `近 90 天有 ${report.coverage.unattributedCouponUsesInLast90Days} 次优惠券使用暂时无法稳定归因到礼包 / 活动，已从活动行统计中排除。`
                  : `${report.coverage.unattributedCouponUsesInLast90Days} coupon uses in the last 90 days cannot yet be stably attributed to a program and are excluded from campaign rows.`}
              </StaffFeedback>
            ) : null}

            {report.activities.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                {isZh
                  ? '当前没有进行中的营销活动。'
                  : 'There are no ongoing marketing campaigns.'}
              </div>
            ) : (
              <MarketingOverviewCampaignTable
                activities={report.activities}
                locale={safeLocale}
                storeStableId={storeStableId}
              />
            )}
          </StaffPanel>
        </div>
      ) : null}
    </StaffPage>
  );
}
