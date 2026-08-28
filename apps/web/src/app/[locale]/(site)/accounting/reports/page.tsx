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

type PnlReport = {
  groupBy: 'month' | 'quarter' | 'year';
  summary: {
    incomeCents: number;
    expenseCents: number;
    adjustmentCents: number;
    netProfitCents: number;
  };
  periods: Array<{
    period: string;
    incomeCents: number;
    expenseCents: number;
    adjustmentCents: number;
    netProfitCents: number;
    isClosed: boolean;
  }>;
  byCategoryTree: Array<{
    categoryStableId: string;
    categoryName: string;
    parentStableId?: string | null;
    type: string;
    amountCents: number;
  }>;
  bySource: Array<{ source: string; amountCents: number }>;
  trends: {
    currentMonthNetCents: number;
    lastMonthNetCents: number;
    quarterToDateNetCents: number;
  };
};

type Cashflow = {
  operatingCents: number;
  investingCents: number;
  financingCents: number;
  netCashflowCents: number;
};

type AccountBalance = Array<{
  accountStableId: string;
  accountName: string;
  inflowCents: number;
  outflowCents: number;
  balanceChangeCents: number;
}>;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function AccountingReportsPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [groupBy, setGroupBy] = useState<'month' | 'quarter' | 'year'>('month');
  const [report, setReport] = useState<PnlReport | null>(null);
  const [cashflow, setCashflow] = useState<Cashflow | null>(null);
  const [balances, setBalances] = useState<AccountBalance>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    void Promise.all([
      apiFetch<PnlReport>(`/accounting/report/pnl?from=${from}&to=${to}&groupBy=${groupBy}`),
      apiFetch<Cashflow>(`/accounting/report/cashflow?from=${from}&to=${to}`),
      apiFetch<AccountBalance>(`/accounting/report/account-balance?from=${from}&to=${to}`),
    ])
      .then(([nextReport, nextCashflow, nextBalances]) => {
        setReport(nextReport);
        setCashflow(nextCashflow);
        setBalances(nextBalances);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [from, to, groupBy]);

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

  function setPreset(preset: 'month' | 'lastMonth' | 'quarter' | 'year') {
    const today = new Date();
    if (preset === 'month') {
      setFrom(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10));
      setTo(today.toISOString().slice(0, 10));
    } else if (preset === 'lastMonth') {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      setFrom(first.toISOString().slice(0, 10));
      setTo(last.toISOString().slice(0, 10));
    } else if (preset === 'quarter') {
      const quarterStart = Math.floor(today.getMonth() / 3) * 3;
      setFrom(new Date(today.getFullYear(), quarterStart, 1).toISOString().slice(0, 10));
      setTo(today.toISOString().slice(0, 10));
    } else {
      setFrom(new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10));
      setTo(today.toISOString().slice(0, 10));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{isZh ? '报表' : 'Reports'}</h1><p className="mt-1 text-sm text-slate-500">{isZh ? '按实际日期区间查看损益、现金流和账户变动。' : 'Use explicit date ranges for P&L, cash flow and account movement.'}</p></div>
        <div className="flex flex-wrap gap-2">
          <a className="rounded border bg-white px-3 py-2 text-sm" href={`/api/v1/accounting/export/report.pdf?template=MANAGEMENT&${exportQuery}`} target="_blank" rel="noreferrer">{isZh ? '管理版 PDF' : 'Management PDF'}</a>
          <a className="rounded border bg-white px-3 py-2 text-sm" href={`/api/v1/accounting/export/report.csv?template=MANAGEMENT&${exportQuery}`} target="_blank" rel="noreferrer">CSV</a>
        </div>
      </div>
      <section className="space-y-3 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap gap-2 text-sm"><button className="rounded border px-3 py-1.5" onClick={() => setPreset('month')}>{isZh ? '本月' : 'This month'}</button><button className="rounded border px-3 py-1.5" onClick={() => setPreset('lastMonth')}>{isZh ? '上月' : 'Last month'}</button><button className="rounded border px-3 py-1.5" onClick={() => setPreset('quarter')}>{isZh ? '本季度' : 'This quarter'}</button><button className="rounded border px-3 py-1.5" onClick={() => setPreset('year')}>{isZh ? '今年' : 'This year'}</button></div>
        <div className="flex flex-wrap gap-2"><input type="date" className="rounded border px-3 py-2" value={from} onChange={(event) => setFrom(event.target.value)} /><span className="self-center text-slate-400">→</span><input type="date" className="rounded border px-3 py-2" value={to} onChange={(event) => setTo(event.target.value)} /><select className="rounded border px-3 py-2" value={groupBy} onChange={(event) => setGroupBy(event.target.value as typeof groupBy)}><option value="month">{isZh ? '按月' : 'Monthly'}</option><option value="quarter">{isZh ? '按季度' : 'Quarterly'}</option><option value="year">{isZh ? '按年' : 'Yearly'}</option></select></div>
      </section>
      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Card label={isZh ? '收入' : 'Income'} cents={report?.summary.incomeCents ?? 0} /><Card label={isZh ? '支出' : 'Expenses'} cents={report?.summary.expenseCents ?? 0} /><Card label={isZh ? '调整' : 'Adjustments'} cents={report?.summary.adjustmentCents ?? 0} /><Card label={isZh ? '净利润' : 'Net profit'} cents={report?.summary.netProfitCents ?? 0} /></div>
      <section className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 text-lg font-semibold">{isZh ? '损益趋势' : 'P&L trend'}</h2><div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey={isZh ? '收入' : 'Income'} /><Line type="monotone" dataKey={isZh ? '支出' : 'Expenses'} /><Line type="monotone" dataKey={isZh ? '净利润' : 'Net'} /></LineChart></ResponsiveContainer></div></section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">{isZh ? '现金流' : 'Cash flow'}</h2><div className="mt-3 space-y-2 text-sm"><Row label={isZh ? '经营活动' : 'Operating'} value={money(cashflow?.operatingCents ?? 0)} /><Row label={isZh ? '投资活动' : 'Investing'} value={money(cashflow?.investingCents ?? 0)} /><Row label={isZh ? '融资活动' : 'Financing'} value={money(cashflow?.financingCents ?? 0)} /><Row label={isZh ? '净现金流' : 'Net cash flow'} value={money(cashflow?.netCashflowCents ?? 0)} strong /></div></div>
        <div className="rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">{isZh ? '账户变动' : 'Account movement'}</h2><div className="mt-3 space-y-2 text-sm">{balances.map((row) => <Row key={row.accountStableId} label={row.accountName} value={money(row.balanceChangeCents)} />)}{!balances.length ? <p className="text-slate-500">{isZh ? '暂无账户流水。' : 'No account movements.'}</p> : null}</div></div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">{isZh ? '分类汇总' : 'Category summary'}</h2><div className="mt-3 space-y-2 text-sm">{(report?.byCategoryTree ?? []).filter((row) => row.amountCents !== 0).map((row) => <Row key={row.categoryStableId} label={`${row.parentStableId ? '└ ' : ''}${row.categoryName}`} value={money(row.amountCents)} />)}</div></div><div className="rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">{isZh ? '来源汇总' : 'Source summary'}</h2><div className="mt-3 space-y-2 text-sm">{(report?.bySource ?? []).map((row) => <Row key={row.source} label={row.source} value={money(row.amountCents)} />)}</div></div></section>
    </div>
  );
}

function Card({ label, cents }: { label: string; cents: number }) {
  return <div className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{money(cents)}</p></div>;
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex justify-between border-b border-slate-100 pb-2 last:border-0"><span>{label}</span><span className={strong ? 'font-semibold' : ''}>{value}</span></div>;
}
