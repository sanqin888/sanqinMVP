'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import {
  accountingBusinessDateToday,
  accountingReportPresetRange,
  type AccountingReportPreset,
} from '../accounting-reporting-date';
import type {
  AccountingBalanceMovementReport,
  AccountingCashflowReport,
  AccountingPnlReport,
  AccountingReportGroupBy,
  AccountingTrialBalanceReport,
} from '../contracts/reports';
import {
  BalanceMovementStatement,
  TrialBalanceStatement,
  type StatementDrillTarget,
} from './accounting-statements';
import { StatementJournalDrillThrough } from './statement-journal-drill-through';

type ReportView = 'management' | 'trialBalance' | 'balanceMovement';

const money = (cents: number) =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

function defaultReportRange() {
  return accountingReportPresetRange('year', accountingBusinessDateToday());
}

export default function AccountingReportsPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const initialRange = defaultReportRange();
  const [view, setView] = useState<ReportView>('management');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [groupBy, setGroupBy] = useState<AccountingReportGroupBy>('month');
  const [report, setReport] = useState<AccountingPnlReport | null>(null);
  const [cashflow, setCashflow] = useState<AccountingCashflowReport | null>(
    null,
  );
  const [trialBalance, setTrialBalance] =
    useState<AccountingTrialBalanceReport | null>(null);
  const [balanceMovement, setBalanceMovement] =
    useState<AccountingBalanceMovementReport | null>(null);
  const [drillTarget, setDrillTarget] = useState<StatementDrillTarget | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    if (view === 'management') {
      setReport(null);
      setCashflow(null);
    } else if (view === 'trialBalance') {
      setTrialBalance(null);
    } else {
      setBalanceMovement(null);
    }

    const load = async () => {
      if (view === 'management') {
        const [nextReport, nextCashflow] = await Promise.all([
          apiFetch<AccountingPnlReport>(
            `/accounting/report/pnl?from=${from}&to=${to}&groupBy=${groupBy}`,
          ),
          apiFetch<AccountingCashflowReport>(
            `/accounting/report/cashflow?from=${from}&to=${to}`,
          ),
        ]);
        if (!cancelled) {
          setReport(nextReport);
          setCashflow(nextCashflow);
        }
        return;
      }

      const query = new URLSearchParams({ from, to }).toString();
      if (view === 'trialBalance') {
        const nextTrialBalance = await apiFetch<AccountingTrialBalanceReport>(
          `/accounting/report/trial-balance?${query}`,
        );
        if (!cancelled) setTrialBalance(nextTrialBalance);
        return;
      }

      const nextBalanceMovement =
        await apiFetch<AccountingBalanceMovementReport>(
          `/accounting/report/balance-movement?${query}`,
        );
      if (!cancelled) setBalanceMovement(nextBalanceMovement);
    };

    void load()
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, groupBy, to, view]);

  const chartData = useMemo(
    () =>
      (report?.periods ?? []).map((item) => ({
        period: item.period,
        [isZh ? '收入' : 'Income']: item.incomeCents / 100,
        [isZh ? '支出' : 'Expenses']: item.expenseCents / 100,
        [isZh ? '净利润' : 'Net']: item.netProfitCents / 100,
      })),
    [isZh, report],
  );

  const exportQuery = new URLSearchParams({ from, to, groupBy }).toString();
  const statementExportQuery = new URLSearchParams({ from, to }).toString();

  function setPreset(preset: AccountingReportPreset) {
    const range = accountingReportPresetRange(
      preset,
      accountingBusinessDateToday(),
    );
    setDrillTarget(null);
    setFrom(range.from);
    setTo(range.to);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{isZh ? '报表' : 'Reports'}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {isZh
              ? 'Management 视图用于经营分析；Trial Balance 与资产负债变动表直接使用 canonical Journal statement authority。'
              : 'Management views support operating analysis; Trial Balance and Balance Movement use canonical Journal statement authority directly.'}
          </p>
        </div>
        <ExportLinks
          view={view}
          managementQuery={exportQuery}
          statementQuery={statementExportQuery}
          isZh={isZh}
        />
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <ViewButton
            active={view === 'management'}
            onClick={() => {
              setDrillTarget(null);
              setView('management');
            }}
          >
            {isZh ? '管理损益' : 'Management P&L'}
          </ViewButton>
          <ViewButton
            active={view === 'trialBalance'}
            onClick={() => {
              setDrillTarget(null);
              setView('trialBalance');
            }}
          >
            {isZh ? '试算平衡' : 'Trial Balance'}
          </ViewButton>
          <ViewButton
            active={view === 'balanceMovement'}
            onClick={() => {
              setDrillTarget(null);
              setView('balanceMovement');
            }}
          >
            {isZh ? '资产负债变动表' : 'Balance Movement'}
          </ViewButton>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <button
            className="rounded border px-3 py-1.5"
            onClick={() => setPreset('month')}
          >
            {isZh ? '本月' : 'This month'}
          </button>
          <button
            className="rounded border px-3 py-1.5"
            onClick={() => setPreset('lastMonth')}
          >
            {isZh ? '上月' : 'Last month'}
          </button>
          <button
            className="rounded border px-3 py-1.5"
            onClick={() => setPreset('quarter')}
          >
            {isZh ? '本季度' : 'This quarter'}
          </button>
          <button
            className="rounded border px-3 py-1.5"
            onClick={() => setPreset('year')}
          >
            {isZh ? '今年' : 'This year'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            className="rounded border px-3 py-2"
            value={from}
            onChange={(event) => {
              setDrillTarget(null);
              setFrom(event.target.value);
            }}
          />
          <span className="self-center text-slate-400">→</span>
          <input
            type="date"
            className="rounded border px-3 py-2"
            value={to}
            onChange={(event) => {
              setDrillTarget(null);
              setTo(event.target.value);
            }}
          />
          {view === 'management' ? (
            <select
              className="rounded border px-3 py-2"
              value={groupBy}
              onChange={(event) =>
                setGroupBy(event.target.value as AccountingReportGroupBy)
              }
            >
              <option value="month">{isZh ? '按月' : 'Monthly'}</option>
              <option value="quarter">{isZh ? '按季度' : 'Quarterly'}</option>
              <option value="year">{isZh ? '按年' : 'Yearly'}</option>
            </select>
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
          {isZh ? '正在读取财务报表…' : 'Loading accounting reports…'}
        </p>
      ) : null}

      {view === 'management' && report ? (
        <ManagementReport
          report={report}
          cashflow={cashflow}
          chartData={chartData}
          isZh={isZh}
        />
      ) : null}

      {view === 'trialBalance' && trialBalance ? (
        <TrialBalanceStatement
          report={trialBalance}
          isZh={isZh}
          onDrillThrough={setDrillTarget}
        />
      ) : null}

      {view === 'balanceMovement' && balanceMovement ? (
        <BalanceMovementStatement
          report={balanceMovement}
          isZh={isZh}
          onDrillThrough={setDrillTarget}
        />
      ) : null}

      {drillTarget && view !== 'management' ? (
        <StatementJournalDrillThrough
          accountStableId={drillTarget.accountStableId}
          accountName={drillTarget.accountName}
          phase={drillTarget.phase}
          from={from}
          to={to}
          currency={
            view === 'trialBalance'
              ? trialBalance?.currency ?? 'CAD'
              : balanceMovement?.currency ?? 'CAD'
          }
          isZh={isZh}
          onClose={() => setDrillTarget(null)}
        />
      ) : null}
    </div>
  );
}

function ExportLinks({
  view,
  managementQuery,
  statementQuery,
  isZh,
}: {
  view: ReportView;
  managementQuery: string;
  statementQuery: string;
  isZh: boolean;
}) {
  const base =
    view === 'management'
      ? '/api/v1/accounting/export/report'
      : view === 'trialBalance'
        ? '/api/v1/accounting/export/trial-balance'
        : '/api/v1/accounting/export/balance-movement';
  const query =
    view === 'management'
      ? `template=MANAGEMENT&${managementQuery}`
      : statementQuery;

  return (
    <div className="flex flex-wrap gap-2">
      <a
        className="rounded border bg-white px-3 py-2 text-sm"
        href={`${base}.pdf?${query}`}
        target="_blank"
        rel="noreferrer"
      >
        {view === 'management'
          ? isZh
            ? '管理版 PDF'
            : 'Management PDF'
          : 'PDF'}
      </a>
      <a
        className="rounded border bg-white px-3 py-2 text-sm"
        href={`${base}.csv?${query}`}
        target="_blank"
        rel="noreferrer"
      >
        CSV
      </a>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'rounded-lg bg-[#87362E] px-3 py-2 text-sm font-semibold text-white'
          : 'rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600'
      }
    >
      {children}
    </button>
  );
}

function ManagementReport({
  report,
  cashflow,
  chartData,
  isZh,
}: {
  report: AccountingPnlReport | null;
  cashflow: AccountingCashflowReport | null;
  chartData: Array<Record<string, string | number>>;
  isZh: boolean;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>{isZh ? 'Management 口径' : 'Management scope'}</strong>
        <p className="mt-1">
          {isZh
            ? '这里用于经营管理分析，可能应用 Expense funding 的 Management 可见性政策；不要与完整 canonical statements 混为一谈。'
            : 'This view is for management analysis and may apply Expense-funding Management visibility policy; it is distinct from full canonical statements.'}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label={isZh ? '收入' : 'Income'}
          cents={report?.summary.incomeCents ?? 0}
        />
        <Card
          label={isZh ? '支出' : 'Expenses'}
          cents={report?.summary.expenseCents ?? 0}
        />
        <Card
          label={isZh ? '调整' : 'Adjustments'}
          cents={report?.summary.adjustmentCents ?? 0}
        />
        <Card
          label={isZh ? '净利润' : 'Net profit'}
          cents={report?.summary.netProfitCents ?? 0}
        />
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
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
              <Line type="monotone" dataKey={isZh ? '收入' : 'Income'} />
              <Line type="monotone" dataKey={isZh ? '支出' : 'Expenses'} />
              <Line type="monotone" dataKey={isZh ? '净利润' : 'Net'} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">
          {isZh ? '现金账户变动' : 'Cash movement'}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {isZh
            ? 'Journal-only 的辅助管理视图；当前分类规则不构成正式现金流量表。'
            : 'A Journal-only management aid; the current classification is not a formal Statement of Cash Flows.'}
        </p>
        <div className="mt-3 space-y-2 text-sm">
          <Row
            label={isZh ? '经营活动' : 'Operating'}
            value={money(cashflow?.operatingCents ?? 0)}
          />
          <Row
            label={isZh ? '投资活动' : 'Investing'}
            value={money(cashflow?.investingCents ?? 0)}
          />
          <Row
            label={isZh ? '融资活动' : 'Financing'}
            value={money(cashflow?.financingCents ?? 0)}
          />
          <Row
            label={isZh ? '净现金变动' : 'Net cash movement'}
            value={money(cashflow?.netCashflowCents ?? 0)}
            strong
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">
            {isZh ? '分类汇总' : 'Category summary'}
          </h2>
          <div className="mt-3 space-y-2 text-sm">
            {(report?.byCategoryTree ?? [])
              .filter((row) => row.amountCents !== 0)
              .map((row) => (
                <Row
                  key={row.categoryStableId}
                  label={`${row.parentStableId ? '└ ' : ''}${row.categoryName}`}
                  value={money(row.amountCents)}
                />
              ))}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">
            {isZh ? '来源汇总' : 'Source summary'}
          </h2>
          <div className="mt-3 space-y-2 text-sm">
            {(report?.bySource ?? []).map((row) => (
              <Row
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

function Card({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{money(cents)}</p>
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2 last:border-0">
      <span>{label}</span>
      <span className={strong ? 'font-semibold' : ''}>{value}</span>
    </div>
  );
}
