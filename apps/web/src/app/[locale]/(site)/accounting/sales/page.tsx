'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '@/lib/api/client';
import type {
  AccountingSalesAnalyticsChannel,
  AccountingSalesAnalyticsPrimaryPaymentMethod,
  AccountingSalesAnalyticsReport,
  AccountingSalesAnalyticsSourceBucket,
  AccountingSalesProviderCoverageStatus,
  AccountingSalesSummary,
  AccountingSalesTenderBucket,
} from '../contracts/reports';
import {
  previousEqualRange,
  previousEqualRangeWithinAccountingCoverage,
} from './sales-comparison-range';

const money = (cents: number) =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

const channelCosts = (summary: AccountingSalesSummary) =>
  summary.platformCommissionCents +
  summary.paymentProcessingFeeCents +
  summary.platformPromotionCents;

function salesReportUrl(from: string, to: string) {
  const query = new URLSearchParams({ from, to }).toString();
  return `/accounting/report/sales?${query}`;
}

function coverageTone(status: AccountingSalesProviderCoverageStatus) {
  switch (status) {
    case 'COMPLETE':
      return 'bg-emerald-50 text-emerald-700';
    case 'INCOMPLETE':
      return 'bg-amber-50 text-amber-700';
    case 'UNKNOWN':
      return 'bg-red-50 text-red-700';
    case 'NOT_APPLICABLE':
      return 'bg-slate-100 text-slate-600';
  }
}

export default function AccountingSalesPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const now = new Date();
  const [from, setFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [report, setReport] = useState<AccountingSalesAnalyticsReport | null>(
    null,
  );
  const [previousReport, setPreviousReport] =
    useState<AccountingSalesAnalyticsReport | null>(null);
  const [comparisonUnavailableReason, setComparisonUnavailableReason] = useState<
    'OUTSIDE_ACCOUNTING_COVERAGE' | 'UNAVAILABLE' | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const comparisonRange = useMemo(
    () =>
      report
        ? previousEqualRangeWithinAccountingCoverage(
            report.from,
            report.to,
            report.accountingStartDate,
          )
        : null,
    [report],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReport(null);
    setPreviousReport(null);
    setComparisonUnavailableReason(null);

    void apiFetch<AccountingSalesAnalyticsReport>(salesReportUrl(from, to))
      .then(async (currentReport) => {
        if (cancelled) return;
        setReport(currentReport);

        const previousRange = previousEqualRange(
          currentReport.from,
          currentReport.to,
        );
        if (!previousRange) {
          setComparisonUnavailableReason('UNAVAILABLE');
          return;
        }
        if (
          !previousEqualRangeWithinAccountingCoverage(
            currentReport.from,
            currentReport.to,
            currentReport.accountingStartDate,
          )
        ) {
          setComparisonUnavailableReason('OUTSIDE_ACCOUNTING_COVERAGE');
          return;
        }

        try {
          const previous = await apiFetch<AccountingSalesAnalyticsReport>(
            salesReportUrl(previousRange.from, previousRange.to),
          );
          if (cancelled) return;
          if (
            previous.from !== previousRange.from ||
            previous.to !== previousRange.to
          ) {
            setComparisonUnavailableReason('UNAVAILABLE');
            return;
          }
          setPreviousReport(previous);
        } catch {
          if (!cancelled) setComparisonUnavailableReason('UNAVAILABLE');
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setReport(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const chartData = useMemo(
    () =>
      (report?.daily ?? []).map((row) => ({
        date: row.date.slice(5),
        [isZh ? '总销售' : 'Gross sales']: row.summary.grossSalesCents / 100,
        [isZh ? '净销售收入' : 'Net sales revenue']:
          row.summary.netSalesRevenueCents / 100,
        [isZh ? '渠道贡献' : 'Channel contribution']:
          row.summary.contributionCents / 100,
      })),
    [isZh, report],
  );

  const summary = report?.summary;
  const previousSummary = previousReport?.summary;
  const currentChannelCosts = summary ? channelCosts(summary) : 0;
  const previousChannelCosts = previousSummary
    ? channelCosts(previousSummary)
    : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{isZh ? '销售' : 'Sales'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '金额以 canonical Journal 为唯一财务权威；订单仅提供渠道和主支付方式等描述性归因。'
            : 'Canonical Journal is the financial authority for every amount; Orders supplies descriptive channel and primary-payment attribution only.'}
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            className="rounded border px-3 py-2 text-sm"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <span className="self-center text-slate-400">→</span>
          <input
            type="date"
            className="rounded border px-3 py-2 text-sm"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
          <span>
            {isZh ? '有效区间' : 'Effective range'}:{' '}
            {report ? `${report.from} — ${report.to}` : '—'}
          </span>
          <span>
            {isZh ? 'Journal 分录' : 'Journal entries'}:{' '}
            {report?.journalEntryCount ?? 0}
          </span>
          <span>
            {isZh ? 'Accounting 起始' : 'Accounting start'}:{' '}
            {report?.accountingStartDate ?? '—'}
          </span>
          {comparisonRange ? (
            <span>
              {isZh ? '等长前期' : 'Previous equal period'}:{' '}
              {comparisonRange.from} — {comparisonRange.to}
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {isZh ? '正在读取 canonical Sales…' : 'Loading canonical Sales…'}
        </p>
      ) : null}
      {comparisonUnavailableReason && report ? (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {comparisonUnavailableReason === 'OUTSIDE_ACCOUNTING_COVERAGE'
            ? isZh
              ? `等长前期无法完整落在 Accounting 覆盖范围内（起始 ${report.accountingStartDate}），因此不会发起前期查询。`
              : `The previous equal period is not fully inside Accounting coverage (starts ${report.accountingStartDate}), so no comparison request is sent.`
            : isZh
              ? '当前区间已加载；等长前期暂不可读取，因此本次不显示前期对比。'
              : 'The current range loaded successfully, but the previous equal period could not be read, so comparison is omitted.'}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label={isZh ? '总销售 / Gross Sales' : 'Gross sales'}
          cents={summary?.grossSalesCents ?? 0}
          previousCents={previousSummary?.grossSalesCents}
          isZh={isZh}
        />
        <KpiCard
          label={isZh ? '销售折扣' : 'Sales discounts'}
          cents={summary?.discountsCents ?? 0}
          previousCents={previousSummary?.discountsCents}
          isZh={isZh}
        />
        <KpiCard
          label={isZh ? '净销售收入' : 'Net sales revenue'}
          cents={summary?.netSalesRevenueCents ?? 0}
          previousCents={previousSummary?.netSalesRevenueCents}
          isZh={isZh}
        />
        <KpiCard
          label={isZh ? '销项税' : 'Output tax'}
          cents={summary?.outputTaxCents ?? 0}
          previousCents={previousSummary?.outputTaxCents}
          isZh={isZh}
        />
        <KpiCard
          label={isZh ? '渠道成本' : 'Channel costs'}
          cents={currentChannelCosts}
          previousCents={previousChannelCosts ?? undefined}
          isZh={isZh}
        />
        <KpiCard
          label={isZh ? '渠道贡献' : 'Channel contribution'}
          cents={summary?.contributionCents ?? 0}
          previousCents={previousSummary?.contributionCents}
          isZh={isZh}
          note={
            isZh
              ? '管理指标，不等于收入或净利润'
              : 'Management metric; not revenue or net profit'
          }
        />
      </section>

      <AttributionNotice report={report} isZh={isZh} />

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">
          {isZh ? '每日销售趋势' : 'Daily sales trend'}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {isZh
            ? '金额来自 Journal；仅当前期完整落在 Accounting 覆盖范围内时，上方 KPI 才显示等长前期对比。'
            : 'Amounts come from Journal; KPI cards show the equal-period comparison only when the full prior range is inside Accounting coverage.'}
        </p>
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey={isZh ? '总销售' : 'Gross sales'}
              />
              <Line
                type="monotone"
                dataKey={isZh ? '净销售收入' : 'Net sales revenue'}
              />
              <Line
                type="monotone"
                dataKey={isZh ? '渠道贡献' : 'Channel contribution'}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DimensionTable
          title={isZh ? '按渠道' : 'By channel'}
          rows={(report?.byChannel ?? []).map((row) => ({
            key: row.key,
            label: channelLabel(row.key, isZh),
            summary: row.summary,
          }))}
          totalNetSalesCents={summary?.netSalesRevenueCents ?? 0}
          isZh={isZh}
        />
        <DimensionTable
          title={isZh ? '按主支付方式（收入归因）' : 'By primary payment method (revenue attribution)'}
          rows={(report?.byPrimaryPaymentMethod ?? []).map((row) => ({
            key: row.key,
            label: paymentLabel(row.key, isZh),
            summary: row.summary,
          }))}
          totalNetSalesCents={summary?.netSalesRevenueCents ?? 0}
          isZh={isZh}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">
            {isZh ? '收款构成 / Tender mix' : 'Tender mix'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? '按 Journal 资产/负债侧实际收款变动，不等同于收入归因。'
              : 'Actual Journal asset/liability movements, separate from revenue attribution.'}
          </p>
          <div className="mt-4 space-y-2 text-sm">
            {(report?.tenderMix ?? []).map((row) => (
              <ValueRow
                key={row.tender}
                label={tenderLabel(row.tender, isZh)}
                value={money(row.amountCents)}
              />
            ))}
            {!report?.tenderMix.length ? (
              <EmptyText isZh={isZh} />
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {isZh ? 'Provider 财务覆盖' : 'Provider financial coverage'}
            </h2>
            {report ? (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${coverageTone(
                  report.providerCoverage.overall,
                )}`}
              >
                {coverageLabel(report.providerCoverage.overall, isZh)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? 'INCOMPLETE / UNKNOWN 表示费用或平台财务信息不能视作完整，不会按 0 处理。'
              : 'INCOMPLETE / UNKNOWN means provider fees or financial evidence must not be treated as complete or zero.'}
          </p>
          <div className="mt-4 space-y-3">
            {(report?.providerCoverage.providers ?? []).map((row) => (
              <div
                key={row.provider}
                className="rounded-lg border border-slate-100 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <strong>{providerLabel(row.provider)}</strong>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${coverageTone(
                      row.status,
                    )}`}
                  >
                    {coverageLabel(row.status, isZh)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {isZh ? '要求历史起点' : 'History required from'}:{' '}
                  {row.financialHistoryRequiredFrom ?? '—'}
                  {' · '}
                  {isZh ? '完整至' : 'Complete through'}:{' '}
                  {row.financialCompleteThrough ?? '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">
          {isZh ? '销售来源 / 调整' : 'Sales sources / adjustments'}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {isZh
            ? '退款/订单变更、历史 Uber 替换 reversal 与 provider statement 分开显示，不重写历史 Journal。'
            : 'Order changes/refunds, historical Uber replacement reversals and provider statements remain separately visible without rewriting Journal history.'}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b">
                <th className="pb-2 pr-4">{isZh ? '来源' : 'Source'}</th>
                <th className="pb-2 pr-4 text-right">
                  {isZh ? '分录数' : 'Entries'}
                </th>
                <th className="pb-2 pr-4 text-right">
                  {isZh ? '净销售收入' : 'Net sales'}
                </th>
                <th className="pb-2 text-right">
                  {isZh ? '渠道贡献' : 'Contribution'}
                </th>
              </tr>
            </thead>
            <tbody>
              {(report?.bySource ?? []).map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    {sourceLabel(row.key, isZh)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {row.journalEntryCount}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {money(row.summary.netSalesRevenueCents)}
                  </td>
                  <td className="py-2 text-right font-medium">
                    {money(row.summary.contributionCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report?.bySource.length ? <EmptyText isZh={isZh} /> : null}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DetailCard
          label={isZh ? '配送收入' : 'Delivery revenue'}
          cents={summary?.deliveryRevenueCents ?? 0}
        />
        <DetailCard
          label={isZh ? '刷卡附加费收入' : 'Card surcharge revenue'}
          cents={summary?.cardSurchargeRevenueCents ?? 0}
        />
        <DetailCard
          label={isZh ? '小费' : 'Tips'}
          cents={summary?.tipsCents ?? 0}
        />
        <DetailCard
          label={isZh ? '其他经营收入' : 'Other operating revenue'}
          cents={summary?.otherOperatingRevenueCents ?? 0}
        />
        <DetailCard
          label={isZh ? '平台佣金' : 'Platform commission'}
          cents={summary?.platformCommissionCents ?? 0}
        />
        <DetailCard
          label={isZh ? '支付处理费' : 'Payment processing fees'}
          cents={summary?.paymentProcessingFeeCents ?? 0}
        />
        <DetailCard
          label={isZh ? '平台促销费用' : 'Platform promotion'}
          cents={summary?.platformPromotionCents ?? 0}
        />
        <DetailCard
          label={isZh ? '广告 / Chargeback / 其他费用' : 'Ads / chargebacks / other fees'}
          cents={
            (summary?.advertisingCents ?? 0) +
            (summary?.chargebackCents ?? 0) +
            (summary?.providerOtherFeeCents ?? 0)
          }
        />
      </section>
    </div>
  );
}

function KpiCard({
  label,
  cents,
  previousCents,
  note,
  isZh,
}: {
  label: string;
  cents: number;
  previousCents?: number;
  note?: string;
  isZh: boolean;
}) {
  const delta = previousCents === undefined ? null : cents - previousCents;
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{money(cents)}</p>
      {delta !== null ? (
        <p className="mt-2 text-xs text-slate-500">
          {isZh ? '前期' : 'Previous'} {money(previousCents ?? 0)}
          {' · '}
          {isZh ? '变化' : 'Change'} {delta >= 0 ? '+' : ''}
          {money(delta)}
        </p>
      ) : null}
      {note ? <p className="mt-2 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

function DimensionTable({
  title,
  rows,
  totalNetSalesCents,
  isZh,
}: {
  title: string;
  rows: Array<{
    key: string;
    label: string;
    summary: AccountingSalesSummary;
  }>;
  totalNetSalesCents: number;
  isZh: boolean;
}) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr className="border-b">
              <th className="pb-2 pr-4">{isZh ? '分类' : 'Group'}</th>
              <th className="pb-2 pr-4 text-right">
                {isZh ? '总销售' : 'Gross'}
              </th>
              <th className="pb-2 pr-4 text-right">
                {isZh ? '折扣' : 'Discounts'}
              </th>
              <th className="pb-2 pr-4 text-right">
                {isZh ? '净销售' : 'Net sales'}
              </th>
              <th className="pb-2 pr-4 text-right">
                {isZh ? '税' : 'Tax'}
              </th>
              <th className="pb-2 pr-4 text-right">
                {isZh ? '占比' : 'Share'}
              </th>
              <th className="pb-2 pr-4 text-right">
                {isZh ? '渠道成本' : 'Costs'}
              </th>
              <th className="pb-2 text-right">
                {isZh ? '贡献' : 'Contribution'}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{row.label}</td>
                <td className="py-2 pr-4 text-right">
                  {money(row.summary.grossSalesCents)}
                </td>
                <td className="py-2 pr-4 text-right">
                  {money(row.summary.discountsCents)}
                </td>
                <td className="py-2 pr-4 text-right">
                  {money(row.summary.netSalesRevenueCents)}
                </td>
                <td className="py-2 pr-4 text-right">
                  {money(row.summary.outputTaxCents)}
                </td>
                <td className="py-2 pr-4 text-right">
                  {totalNetSalesCents === 0
                    ? '—'
                    : `${(
                        (row.summary.netSalesRevenueCents / totalNetSalesCents) *
                        100
                      ).toFixed(1)}%`}
                </td>
                <td className="py-2 pr-4 text-right">
                  {money(channelCosts(row.summary))}
                </td>
                <td className="py-2 text-right font-semibold">
                  {money(row.summary.contributionCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <EmptyText isZh={isZh} /> : null}
      </div>
    </div>
  );
}

function AttributionNotice({
  report,
  isZh,
}: {
  report: AccountingSalesAnalyticsReport | null;
  isZh: boolean;
}) {
  if (!report) return null;
  const { attribution } = report;
  const orderAttributedJournalEntries =
    attribution.immutableOrderAttributedJournalEntries +
    attribution.legacyOrderAttributedJournalEntries +
    attribution.missingOrderAttributedJournalEntries;
  if (orderAttributedJournalEntries === 0) {
    return (
      <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {isZh
          ? '本区间没有需要 Orders 描述性归因的 Journal。'
          : 'No Journal entries in this range require Orders descriptive attribution.'}
      </p>
    );
  }
  if (attribution.missingOrderAttributedJournalEntries > 0) {
    return (
      <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
        {isZh
          ? `有 ${attribution.missingOrderAttributedJournalEntries} 条 Journal 缺少 Orders 描述性归因；金额仍来自 canonical Journal，并已归入“未归因”。`
          : `${attribution.missingOrderAttributedJournalEntries} Journal entries lack Orders descriptive attribution. Amounts remain canonical and are grouped as Unattributed.`}
      </p>
    );
  }
  if (attribution.legacyOrderAttributedJournalEntries > 0) {
    return (
      <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {isZh
          ? `有 ${attribution.legacyOrderAttributedJournalEntries} 条历史 Journal 使用 LEGACY_CURRENT_ORDER 描述性归因；金额仍由 Journal 权威控制。`
          : `${attribution.legacyOrderAttributedJournalEntries} historical Journal entries use LEGACY_CURRENT_ORDER descriptive attribution; monetary authority remains Journal.`}
      </p>
    );
  }
  return (
    <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {isZh
        ? '本区间的订单归因均来自 immutable facts。'
        : 'Order attribution in this range is backed by immutable facts.'}
    </p>
  );
}

function DetailCard({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold">{money(cents)}</p>
    </div>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyText({ isZh }: { isZh: boolean }) {
  return (
    <p className="py-3 text-sm text-slate-500">
      {isZh ? '当前区间暂无数据。' : 'No data for this range.'}
    </p>
  );
}

function channelLabel(key: AccountingSalesAnalyticsChannel, isZh: boolean) {
  const labels: Record<AccountingSalesAnalyticsChannel, [string, string]> = {
    web: ['网站', 'Web'],
    in_store: ['门店', 'In-store'],
    ubereats: ['Uber Eats', 'Uber Eats'],
    fantuan: ['饭团', 'Fantuan'],
    UNATTRIBUTED_PROVIDER: ['Provider 未归因', 'Unattributed provider'],
    UNATTRIBUTED: ['未归因', 'Unattributed'],
  };
  return labels[key][isZh ? 0 : 1];
}

function paymentLabel(
  key: AccountingSalesAnalyticsPrimaryPaymentMethod,
  isZh: boolean,
) {
  const labels: Record<
    AccountingSalesAnalyticsPrimaryPaymentMethod,
    [string, string]
  > = {
    CASH: ['现金', 'Cash'],
    CARD: ['银行卡', 'Card'],
    WECHAT_ALIPAY: ['微信 / 支付宝', 'WeChat / Alipay'],
    STORE_BALANCE: ['会员余额', 'Store balance'],
    UBEREATS: ['Uber Eats', 'Uber Eats'],
    FANTUAN: ['饭团', 'Fantuan'],
    UNATTRIBUTED: ['未归因', 'Unattributed'],
  };
  return labels[key][isZh ? 0 : 1];
}

function tenderLabel(key: AccountingSalesTenderBucket, isZh: boolean) {
  const labels: Record<AccountingSalesTenderBucket, [string, string]> = {
    STORE_CASH_EQUIVALENT: ['门店现金等价收款', 'Store cash equivalent'],
    CLOVER_CARD: ['Clover Card', 'Clover card'],
    UBER_EATS: ['Uber Eats 应收', 'Uber Eats receivable'],
    FANTUAN: ['饭团应收', 'Fantuan receivable'],
    STORE_BALANCE: ['会员余额负债', 'Store balance liability'],
  };
  return labels[key][isZh ? 0 : 1];
}

function sourceLabel(key: AccountingSalesAnalyticsSourceBucket, isZh: boolean) {
  const labels: Record<AccountingSalesAnalyticsSourceBucket, [string, string]> = {
    ORDER_SALE: ['订单销售', 'Order sale'],
    ORDER_CHANGE: ['订单退款 / 变更', 'Order refund / change'],
    PROVIDER_STATEMENT: ['Provider 结算单', 'Provider statement'],
    HISTORICAL_REPLACEMENT_REVERSAL: [
      '历史 Uber 替换 reversal',
      'Historical Uber replacement reversal',
    ],
  };
  return labels[key][isZh ? 0 : 1];
}

function coverageLabel(
  status: AccountingSalesProviderCoverageStatus,
  isZh: boolean,
) {
  const labels: Record<
    AccountingSalesProviderCoverageStatus,
    [string, string]
  > = {
    COMPLETE: ['完整', 'Complete'],
    INCOMPLETE: ['不完整', 'Incomplete'],
    UNKNOWN: ['未知', 'Unknown'],
    NOT_APPLICABLE: ['不适用', 'Not applicable'],
  };
  return labels[status][isZh ? 0 : 1];
}

function providerLabel(provider: 'CLOVER' | 'UBER_EATS' | 'FANTUAN') {
  if (provider === 'UBER_EATS') return 'Uber Eats';
  if (provider === 'FANTUAN') return 'Fantuan';
  return 'Clover';
}
