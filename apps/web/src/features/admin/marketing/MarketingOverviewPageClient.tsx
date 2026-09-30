'use client';

import {
  Activity,
  CalendarDays,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  Tags,
  TicketPercent,
} from 'lucide-react';
import Link from 'next/link';
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
import { apiFetch } from '@/lib/api/client';
import type { Locale } from '@/lib/i18n/locales';

type WindowKey = 'today' | 'last7Days' | 'month' | 'quarter';
type CampaignKind = 'DAILY_SPECIAL' | 'PROMOTION_RULE' | 'COUPON_PROGRAM';
type CampaignScope = 'STORE' | 'BRAND';

type WindowMetrics = {
  uses: number;
};

type MarketingActivity = {
  activityStableId: string;
  kind: CampaignKind;
  scope: CampaignScope;
  storeStableId: string | null;
  titleZh: string;
  titleEn: string | null;
  subtype: string;
  validFrom: string | null;
  validTo: string | null;
  weekdays: number[];
  startMinutes: number | null;
  endMinutes: number | null;
  metrics: Record<WindowKey, WindowMetrics>;
};

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
    unattributedCouponUsesInQuarter: number;
  };
};

const WINDOW_KEYS: WindowKey[] = ['today', 'last7Days', 'month', 'quarter'];

function windowLabel(key: WindowKey, isZh: boolean): string {
  if (key === 'today') return isZh ? '今天' : 'Today';
  if (key === 'last7Days') return isZh ? '近 7 天' : 'Last 7 days';
  if (key === 'month') return isZh ? '本月' : 'This month';
  return isZh ? '本季度' : 'This quarter';
}

function kindLabel(kind: CampaignKind, isZh: boolean): string {
  if (kind === 'DAILY_SPECIAL') return isZh ? '商品特价' : 'Item special';
  if (kind === 'COUPON_PROGRAM') {
    return isZh ? '优惠券 / 礼包' : 'Coupon / bundle';
  }
  return isZh ? '自动 / 积分活动' : 'Automatic / loyalty';
}

function scopeLabel(scope: CampaignScope, isZh: boolean): string {
  return scope === 'STORE'
    ? isZh
      ? '门店'
      : 'Store'
    : isZh
      ? '品牌'
      : 'Brand';
}

function kindIcon(kind: CampaignKind) {
  if (kind === 'DAILY_SPECIAL') return Sparkles;
  if (kind === 'COUPON_PROGRAM') return TicketPercent;
  return Tags;
}

function managementHref(
  kind: CampaignKind,
  locale: Locale,
  storeStableId: string,
): string {
  const base = `/${locale}/admin/promotions`;
  const path =
    kind === 'DAILY_SPECIAL'
      ? `${base}/specials`
      : kind === 'COUPON_PROGRAM'
        ? `${base}/coupons`
        : `${base}/automatic`;
  return `${path}?store=${encodeURIComponent(storeStableId)}`;
}

function activityTitle(activity: MarketingActivity, isZh: boolean): string {
  if (isZh) {
    return activity.titleZh || activity.titleEn || activity.activityStableId;
  }
  return activity.titleEn || activity.titleZh || activity.activityStableId;
}

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
      month: totalFor('month'),
      quarter: totalFor('quarter'),
    };
  }, [report]);

  return (
    <StaffPage>
      <StaffPageHeader
        eyebrow={isZh ? '营销' : 'Marketing'}
        title={isZh ? '营销总览' : 'Marketing overview'}
        description={
          isZh
            ? '按当前门店查看正在进行的商品特价、优惠券礼包和自动 / 积分活动。第一版先突出活动使用次数，金额与商品件数指标将在完成生产对账后展示。'
            : 'Monitor ongoing item specials, coupon programs, and automatic or loyalty campaigns for the current store. This first view emphasizes campaign uses; monetary and item-quantity metrics remain hidden until production reconciliation is complete.'
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
                    ? `共 ${report.activities.length} 个进行中活动 · ${report.timezone}`
                    : `${report.activities.length} ongoing campaigns · ${report.timezone}`}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                {isZh ? '更新于 ' : 'Updated '}
                {formatGeneratedAt(report.generatedAt, safeLocale)}
              </p>
            </div>

            {report.coverage.unattributedCouponUsesInQuarter > 0 ? (
              <StaffFeedback tone="warning" className="mt-4">
                {isZh
                  ? `本季度有 ${report.coverage.unattributedCouponUsesInQuarter} 次优惠券使用暂时无法稳定归因到礼包 / 活动，已从活动行统计中排除。`
                  : `${report.coverage.unattributedCouponUsesInQuarter} coupon uses in the current quarter cannot yet be stably attributed to a program and are excluded from campaign rows.`}
              </StaffFeedback>
            ) : null}

            {report.activities.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                {isZh
                  ? '当前没有进行中的营销活动。'
                  : 'There are no ongoing marketing campaigns.'}
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
                  <thead>
                    <tr className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      <th className="border-b border-slate-200 px-3 py-3">
                        {isZh ? '活动' : 'Campaign'}
                      </th>
                      {WINDOW_KEYS.map((key) => (
                        <th
                          key={key}
                          className="border-b border-slate-200 px-3 py-3 text-right"
                        >
                          {windowLabel(key, isZh)}
                        </th>
                      ))}
                      <th className="border-b border-slate-200 px-3 py-3 text-right">
                        {isZh ? '管理' : 'Manage'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.activities.map((activity) => {
                      const Icon = kindIcon(activity.kind);
                      return (
                        <tr key={activity.activityStableId}>
                          <td className="border-b border-slate-100 px-3 py-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#87362E]/10 text-[#762f28]">
                                <Icon className="size-4" aria-hidden="true" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-950">
                                  {activityTitle(activity, isZh)}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                    {kindLabel(activity.kind, isZh)}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                    {scopeLabel(activity.scope, isZh)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          {WINDOW_KEYS.map((key) => (
                            <td
                              key={key}
                              className="border-b border-slate-100 px-3 py-4 text-right font-mono text-base font-semibold text-slate-900"
                            >
                              {activity.metrics[key].uses.toLocaleString()}
                            </td>
                          ))}
                          <td className="border-b border-slate-100 px-3 py-4 text-right">
                            <Link
                              href={managementHref(
                                activity.kind,
                                safeLocale,
                                storeStableId,
                              )}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[#762f28] outline-none hover:bg-[#87362E]/10 focus-visible:ring-2 focus-visible:ring-[#87362E]/25"
                            >
                              {isZh ? '管理' : 'Manage'}
                              <ExternalLink
                                className="size-3.5"
                                aria-hidden="true"
                              />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </StaffPanel>
        </div>
      ) : null}
    </StaffPage>
  );
}
