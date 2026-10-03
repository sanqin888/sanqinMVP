'use client';

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
import type {
  AccountingCashflowReport,
  AccountingPnlReport,
} from '@/lib/contracts/accounting-management';

const money = (cents: number) =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

const MANAGEMENT_PNL_CHART_COLORS = {
  income: '#15803D',
  expenses: '#DC2626',
  netProfit: '#2563EB',
} as const;

function adjustmentLabel(
  sourceFactType: string | null,
  source: string,
  isZh: boolean,
) {
  if (sourceFactType === 'order.financial_reversal.v1') {
    return isZh ? '订单退款 / 冲销' : 'Order reversal / refund';
  }
  if (sourceFactType === 'order.financial_adjustment.v1') {
    return isZh ? '订单调整' : 'Order adjustment';
  }
  if (sourceFactType === 'accounting.uber_pre_cutover_order_reversal.v1') {
    return isZh
      ? 'Uber 历史订单冲销'
      : 'Uber pre-cutover order reversal';
  }
  return sourceFactType ?? source;
}

function MetricCard({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{money(cents)}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
      <span className="min-w-0 break-words">{label}</span>
      <span
        className={
          strong
            ? 'shrink-0 font-semibold tabular-nums'
            : 'shrink-0 tabular-nums'
        }
      >
        {value}
      </span>
    </div>
  );
}

export function ManagementPnlReportView({
  report,
  cashflow,
  isZh,
}: {
  report: AccountingPnlReport;
  cashflow: AccountingCashflowReport;
  isZh: boolean;
}) {
  const chartData = report.periods.map((item) => ({
    period: item.period,
    [isZh ? '收入' : 'Income']: item.incomeCents / 100,
    [isZh ? '支出' : 'Expenses']: item.expenseCents / 100,
    [isZh ? '净利润' : 'Net profit']: item.netProfitCents / 100,
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
        <strong>
          {isZh ? '全业务 / 全账本管理口径' : 'Whole-business / whole-ledger management scope'}
        </strong>
        <p className="mt-1">
          {isZh
            ? '这里直接展示 Accounting 拥有的 Management P&L 投影。它不随 Admin 门店选择变化，也不表示单门店损益；Management 可见性政策可能影响费用展示，并且它与正式 canonical statements 保持区分。'
            : 'This directly presents the Accounting-owned Management P&L projection. It does not follow Admin Store selection and must not be read as Store-level P&L. Management visibility policy may affect expense presentation, and this remains distinct from formal canonical statements.'}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={isZh ? '收入' : 'Income'}
          cents={report.summary.incomeCents}
        />
        <MetricCard
          label={isZh ? '支出' : 'Expenses'}
          cents={report.summary.expenseCents}
        />
        <MetricCard
          label={isZh ? '净调整影响' : 'Net adjustment effect'}
          cents={report.summary.adjustmentCents}
        />
        <MetricCard
          label={isZh ? '净利润' : 'Net profit'}
          cents={report.summary.netProfitCents}
        />
      </div>

      {report.adjustmentBreakdown.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">
            {isZh ? '调整影响分解' : 'Adjustment effect breakdown'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? '仅分解 Accounting Management P&L 已返回的净调整影响；Admin 不重新计算净利润。'
              : 'This only decomposes the net adjustment effect already returned by Accounting Management P&L; Admin does not recalculate net profit.'}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-2 py-2">
                    {isZh ? '调整来源' : 'Adjustment source'}
                  </th>
                  <th className="px-2 py-2 text-right">
                    {isZh ? 'Journal 数' : 'Journals'}
                  </th>
                  <th className="px-2 py-2 text-right">
                    {isZh ? '收入净变动' : 'Revenue net change'}
                  </th>
                  <th className="px-2 py-2 text-right">
                    {isZh ? '费用净变动' : 'Expense net change'}
                  </th>
                  <th className="px-2 py-2 text-right">
                    {isZh ? '净利润影响' : 'Net profit effect'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.adjustmentBreakdown.map((row) => (
                  <tr key={`${row.source}:${row.sourceFactType ?? 'unknown'}`}>
                    <td className="px-2 py-2">
                      <div className="font-medium text-slate-800">
                        {adjustmentLabel(row.sourceFactType, row.source, isZh)}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                        {row.source} · {row.sourceFactType ?? '—'}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {row.journalCount}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {money(row.revenueNetCents)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {money(row.expenseNetCents)}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {money(row.netProfitEffectCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">
          {isZh ? '损益趋势' : 'P&L trend'}
        </h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey={isZh ? '收入' : 'Income'}
                stroke={MANAGEMENT_PNL_CHART_COLORS.income}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey={isZh ? '支出' : 'Expenses'}
                stroke={MANAGEMENT_PNL_CHART_COLORS.expenses}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey={isZh ? '净利润' : 'Net profit'}
                stroke={MANAGEMENT_PNL_CHART_COLORS.netProfit}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-semibold">
          {isZh ? '现金账户变动' : 'Cash movement'}
        </h2>
        <p className="mt-1 text-xs text-amber-900">
          {isZh
            ? 'Journal-only management aid；这是管理辅助视图，不是正式现金流量表（Statement of Cash Flows）。'
            : 'Journal-only management aid; this is not a formal Statement of Cash Flows.'}
        </p>
        <div className="mt-3 space-y-2 text-sm">
          <SummaryRow
            label={isZh ? '经营活动' : 'Operating'}
            value={money(cashflow.operatingCents)}
          />
          <SummaryRow
            label={isZh ? '投资活动' : 'Investing'}
            value={money(cashflow.investingCents)}
          />
          <SummaryRow
            label={isZh ? '融资活动' : 'Financing'}
            value={money(cashflow.financingCents)}
          />
          <SummaryRow
            label={isZh ? '净现金变动' : 'Net cash movement'}
            value={money(cashflow.netCashflowCents)}
            strong
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">
            {isZh ? '分类汇总' : 'Category summary'}
          </h2>
          <div className="mt-3 space-y-2 text-sm">
            {report.byCategoryTree
              .filter((row) => row.amountCents !== 0)
              .map((row) => (
                <SummaryRow
                  key={row.categoryStableId}
                  label={`${row.parentStableId ? '└ ' : ''}${row.categoryName}`}
                  value={money(row.amountCents)}
                />
              ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">
            {isZh ? '来源汇总' : 'Source summary'}
          </h2>
          <div className="mt-3 space-y-2 text-sm">
            {report.bySource.map((row) => (
              <SummaryRow
                key={row.source}
                label={row.source}
                value={money(row.amountCents)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
