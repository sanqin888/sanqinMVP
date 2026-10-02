'use client';

import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Tags,
  TicketPercent,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { Locale } from '@/lib/i18n/locales';

export type WindowKey = 'today' | 'last7Days' | 'last30Days' | 'last90Days';
type CampaignKind = 'DAILY_SPECIAL' | 'PROMOTION_RULE' | 'COUPON_PROGRAM';
type CampaignScope = 'STORE' | 'BRAND';

type MetricCoverage =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'NOT_APPLICABLE';

type PerformanceMetric = {
  value: number | null;
  coverage: MetricCoverage;
  coveredUses: number;
  totalUses: number;
};

type AssociatedSalesEvidence =
  | 'NO_USAGE'
  | 'IMMUTABLE_ONLY'
  | 'INCLUDES_LEGACY_CURRENT_ORDER';

type WindowMetrics = {
  uses: number;
  affectedItemQuantity: PerformanceMetric;
  discountCents: PerformanceMetric;
  associatedSalesCents: number;
  associatedSalesEvidence: AssociatedSalesEvidence;
};

export type MarketingActivity = {
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

export const WINDOW_KEYS: WindowKey[] = [
  'today',
  'last7Days',
  'last30Days',
  'last90Days',
];

export function windowLabel(key: WindowKey, isZh: boolean): string {
  if (key === 'today') return isZh ? '今天' : 'Today';
  if (key === 'last7Days') return isZh ? '近 7 天' : 'Last 7 days';
  if (key === 'last30Days') return isZh ? '近 30 天' : 'Last 30 days';
  return isZh ? '近 90 天' : 'Last 90 days';
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

function dailySpecialWeekdayLabel(
  weekdays: number[],
  isZh: boolean,
): string | null {
  const weekday = weekdays[0];
  const labels: Record<number, { zh: string; en: string }> = {
    1: { zh: '周一', en: 'Monday' },
    2: { zh: '周二', en: 'Tuesday' },
    3: { zh: '周三', en: 'Wednesday' },
    4: { zh: '周四', en: 'Thursday' },
    5: { zh: '周五', en: 'Friday' },
    6: { zh: '周六', en: 'Saturday' },
    7: { zh: '周日', en: 'Sunday' },
  };
  const label = labels[weekday];
  return label ? (isZh ? label.zh : label.en) : null;
}

function activityTitle(activity: MarketingActivity, isZh: boolean): string {
  if (activity.kind === 'DAILY_SPECIAL') {
    const weekday = dailySpecialWeekdayLabel(activity.weekdays, isZh);
    if (weekday) {
      return isZh ? `${weekday}特价` : `${weekday} Daily Special`;
    }
    return isZh ? '每日特价' : 'Daily Special';
  }
  if (isZh) {
    return activity.titleZh || activity.titleEn || activity.activityStableId;
  }
  return activity.titleEn || activity.titleZh || activity.activityStableId;
}

function activitySubjectLabel(
  activity: MarketingActivity,
  isZh: boolean,
): string | null {
  if (activity.kind !== 'DAILY_SPECIAL') return null;
  const subject = isZh
    ? activity.titleZh || activity.titleEn
    : activity.titleEn || activity.titleZh;
  if (!subject) return null;
  return isZh ? `当前菜品：${subject}` : `Current item: ${subject}`;
}

function aggregatePerformanceMetric(
  metrics: readonly PerformanceMetric[],
): PerformanceMetric {
  const totalUses = metrics.reduce((sum, metric) => sum + metric.totalUses, 0);
  const coveredUses = metrics.reduce(
    (sum, metric) => sum + metric.coveredUses,
    0,
  );

  if (
    metrics.length > 0 &&
    metrics.every((metric) => metric.coverage === 'NOT_APPLICABLE')
  ) {
    return {
      value: null,
      coverage: 'NOT_APPLICABLE',
      coveredUses: 0,
      totalUses,
    };
  }

  if (totalUses === 0) {
    return { value: 0, coverage: 'COMPLETE', coveredUses: 0, totalUses: 0 };
  }

  const coveredValue = metrics.reduce(
    (sum, metric) => sum + (metric.value ?? 0),
    0,
  );

  if (coveredUses === totalUses) {
    return {
      value: coveredValue,
      coverage: 'COMPLETE',
      coveredUses,
      totalUses,
    };
  }

  if (coveredUses > 0) {
    return {
      value: coveredValue,
      coverage: 'PARTIAL',
      coveredUses,
      totalUses,
    };
  }

  return {
    value: null,
    coverage: 'UNAVAILABLE',
    coveredUses: 0,
    totalUses,
  };
}

function aggregateDailySpecialWindow(
  activities: readonly MarketingActivity[],
  key: WindowKey,
): WindowMetrics {
  const metrics = activities.map((activity) => activity.metrics[key]);
  const uses = metrics.reduce((sum, metric) => sum + metric.uses, 0);

  return {
    uses,
    affectedItemQuantity: aggregatePerformanceMetric(
      metrics.map((metric) => metric.affectedItemQuantity),
    ),
    discountCents: aggregatePerformanceMetric(
      metrics.map((metric) => metric.discountCents),
    ),
    associatedSalesCents: metrics.reduce(
      (sum, metric) => sum + metric.associatedSalesCents,
      0,
    ),
    associatedSalesEvidence:
      uses === 0
        ? 'NO_USAGE'
        : metrics.some(
              (metric) =>
                metric.associatedSalesEvidence ===
                'INCLUDES_LEGACY_CURRENT_ORDER',
            )
          ? 'INCLUDES_LEGACY_CURRENT_ORDER'
          : 'IMMUTABLE_ONLY',
  };
}

function formatCadCents(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(value / 100);
}

function metricCoverageLabel(
  metric: PerformanceMetric,
  isZh: boolean,
): string | null {
  if (metric.coverage === 'COMPLETE') return null;
  if (metric.coverage === 'PARTIAL') {
    return isZh
      ? `部分覆盖 ${metric.coveredUses}/${metric.totalUses} 次`
      : `Partial ${metric.coveredUses}/${metric.totalUses} uses`;
  }
  if (metric.coverage === 'UNAVAILABLE') {
    return isZh ? '暂无可靠数据' : 'Unavailable';
  }
  return isZh ? '不适用' : 'N/A';
}

function associatedSalesEvidenceLabel(
  evidence: AssociatedSalesEvidence,
  isZh: boolean,
): string | null {
  if (evidence === 'NO_USAGE') return null;
  if (evidence === 'IMMUTABLE_ONLY') {
    return isZh ? '不可变销售快照' : 'Immutable sale facts';
  }
  return isZh
    ? '包含历史 current-order 证据'
    : 'Includes legacy current-order evidence';
}

function PerformanceMetricValue({
  metric,
  locale,
  isCurrency = false,
}: {
  metric: PerformanceMetric;
  locale: Locale;
  isCurrency?: boolean;
}) {
  const isZh = locale === 'zh';
  const coverageLabel = metricCoverageLabel(metric, isZh);
  const value =
    metric.value === null
      ? '—'
      : isCurrency
        ? formatCadCents(metric.value, locale)
        : metric.value.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-CA');

  return (
    <div>
      <span className="font-semibold text-slate-900">{value}</span>
      {coverageLabel ? (
        <span
          className={
            metric.coverage === 'PARTIAL'
              ? 'ml-1.5 text-[11px] font-medium text-amber-700'
              : 'ml-1.5 text-[11px] text-slate-500'
          }
        >
          {coverageLabel}
        </span>
      ) : null}
      {metric.coverage === 'PARTIAL' ? (
        <div className="mt-0.5 text-[10px] text-amber-700">
          {isZh ? '已覆盖小计，不是完整总额' : 'Covered subtotal, not full total'}
        </div>
      ) : null}
    </div>
  );
}

function WindowPerformanceCell({
  metrics,
  locale,
}: {
  metrics: WindowMetrics;
  locale: Locale;
}) {
  const isZh = locale === 'zh';
  const salesEvidence = associatedSalesEvidenceLabel(
    metrics.associatedSalesEvidence,
    isZh,
  );

  return (
    <div className="min-w-40 space-y-2 text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-slate-500">{isZh ? '使用' : 'Uses'}</span>
        <span className="font-semibold text-slate-950">
          {metrics.uses.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-CA')}
        </span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <span className="shrink-0 text-slate-500">
          {isZh ? '关联件数' : 'Items'}
        </span>
        <div className="text-right">
          <PerformanceMetricValue
            metric={metrics.affectedItemQuantity}
            locale={locale}
          />
        </div>
      </div>
      <div className="flex items-start justify-between gap-3">
        <span className="shrink-0 text-slate-500">
          {isZh ? '实际优惠' : 'Discount'}
        </span>
        <div className="text-right">
          <PerformanceMetricValue
            metric={metrics.discountCents}
            locale={locale}
            isCurrency
          />
        </div>
      </div>
      <div className="flex items-start justify-between gap-3">
        <span className="shrink-0 text-slate-500">
          {isZh ? '关联销售' : 'Assoc. sales'}
        </span>
        <div className="text-right">
          <div className="font-semibold text-slate-900">
            {formatCadCents(metrics.associatedSalesCents, locale)}
          </div>
          {salesEvidence ? (
            <div
              className={
                metrics.associatedSalesEvidence ===
                'INCLUDES_LEGACY_CURRENT_ORDER'
                  ? 'mt-0.5 text-[10px] text-amber-700'
                  : 'mt-0.5 text-[10px] text-slate-500'
              }
            >
              {salesEvidence}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MarketingActivityRow({
  activity,
  locale,
  storeStableId,
  isChild = false,
}: {
  activity: MarketingActivity;
  locale: Locale;
  storeStableId: string;
  isChild?: boolean;
}) {
  const isZh = locale === 'zh';
  const Icon = kindIcon(activity.kind);

  return (
    <tr className={isChild ? 'bg-slate-50/70' : undefined}>
      <td className="border-b border-slate-100 px-3 py-4">
        <div className={`flex items-start gap-3 ${isChild ? 'pl-8' : ''}`}>
          <div
            className={
              isChild
                ? 'mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200'
                : 'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#87362E]/10 text-[#762f28]'
            }
          >
            <Icon
              className={isChild ? 'size-3.5' : 'size-4'}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-950">
              {activityTitle(activity, isZh)}
            </p>
            {activitySubjectLabel(activity, isZh) ? (
              <p className="mt-0.5 text-xs text-slate-500">
                {activitySubjectLabel(activity, isZh)}
              </p>
            ) : null}
            {!isChild ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {kindLabel(activity.kind, isZh)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {scopeLabel(activity.scope, isZh)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </td>
      {WINDOW_KEYS.map((key) => (
        <td
          key={key}
          className="border-b border-slate-100 px-3 py-4 align-top"
        >
          <WindowPerformanceCell
            metrics={activity.metrics[key]}
            locale={locale}
          />
        </td>
      ))}
      <td className="border-b border-slate-100 px-3 py-4 text-right">
        {!isChild ? (
          <Link
            href={managementHref(activity.kind, locale, storeStableId)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[#762f28] outline-none hover:bg-[#87362E]/10 focus-visible:ring-2 focus-visible:ring-[#87362E]/25"
          >
            {isZh ? '管理' : 'Manage'}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </td>
    </tr>
  );
}

export function MarketingOverviewCampaignTable({
  activities,
  locale,
  storeStableId,
}: {
  activities: MarketingActivity[];
  locale: Locale;
  storeStableId: string;
}) {
  const isZh = locale === 'zh';
  const [dailySpecialExpanded, setDailySpecialExpanded] = useState(false);

  const dailySpecialActivities = useMemo(
    () =>
      activities
        .filter((activity) => activity.kind === 'DAILY_SPECIAL')
        .sort(
          (left, right) =>
            (left.weekdays[0] ?? Number.MAX_SAFE_INTEGER) -
            (right.weekdays[0] ?? Number.MAX_SAFE_INTEGER),
        ),
    [activities],
  );

  const standardActivities = useMemo(
    () => activities.filter((activity) => activity.kind !== 'DAILY_SPECIAL'),
    [activities],
  );

  const dailySpecialMetrics = useMemo<Record<WindowKey, WindowMetrics>>(
    () => ({
      today: aggregateDailySpecialWindow(dailySpecialActivities, 'today'),
      last7Days: aggregateDailySpecialWindow(
        dailySpecialActivities,
        'last7Days',
      ),
      last30Days: aggregateDailySpecialWindow(
        dailySpecialActivities,
        'last30Days',
      ),
      last90Days: aggregateDailySpecialWindow(
        dailySpecialActivities,
        'last90Days',
      ),
    }),
    [dailySpecialActivities],
  );
  const dailySpecialScope = dailySpecialActivities[0]?.scope ?? 'STORE';

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-left text-sm">
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
          {dailySpecialActivities.length > 0 ? (
            <>
              <tr className="bg-[#87362E]/[0.025]">
                <td className="border-b border-slate-100 px-3 py-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#87362E]/10 text-[#762f28]">
                      <Sparkles className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">
                          {isZh ? '每日特价' : 'Daily Special'}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setDailySpecialExpanded((current) => !current)
                          }
                          aria-expanded={dailySpecialExpanded}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#762f28] outline-none hover:bg-[#87362E]/10 focus-visible:ring-2 focus-visible:ring-[#87362E]/25"
                        >
                          {dailySpecialExpanded ? (
                            <ChevronDown
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronRight
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          )}
                          {dailySpecialExpanded
                            ? isZh
                              ? '收起每日明细'
                              : 'Hide daily details'
                            : isZh
                              ? '查看每日明细'
                              : 'View daily details'}
                        </button>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {isZh
                          ? `${dailySpecialActivities.length} 个每日特价日程统一汇总；展开后查看每天的菜品与统计。`
                          : `${dailySpecialActivities.length} weekday schedules combined; expand to inspect each day and current item.`}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {isZh ? '商品特价' : 'Item special'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {scopeLabel(dailySpecialScope, isZh)}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                {WINDOW_KEYS.map((key) => (
                  <td
                    key={key}
                    className="border-b border-slate-100 px-3 py-4 align-top"
                  >
                    <WindowPerformanceCell
                      metrics={dailySpecialMetrics[key]}
                      locale={locale}
                    />
                  </td>
                ))}
                <td className="border-b border-slate-100 px-3 py-4 text-right">
                  <Link
                    href={managementHref(
                      'DAILY_SPECIAL',
                      locale,
                      storeStableId,
                    )}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[#762f28] outline-none hover:bg-[#87362E]/10 focus-visible:ring-2 focus-visible:ring-[#87362E]/25"
                  >
                    {isZh ? '管理' : 'Manage'}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
              {dailySpecialExpanded
                ? dailySpecialActivities.map((activity) => (
                    <MarketingActivityRow
                      key={activity.activityStableId}
                      activity={activity}
                      locale={locale}
                      storeStableId={storeStableId}
                      isChild
                    />
                  ))
                : null}
            </>
          ) : null}
          {standardActivities.map((activity) => (
            <MarketingActivityRow
              key={activity.activityStableId}
              activity={activity}
              locale={locale}
              storeStableId={storeStableId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
