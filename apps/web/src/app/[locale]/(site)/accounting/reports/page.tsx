'use client';

import { useEffect, useMemo, useState } from 'react';
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
    categoryId: string;
    categoryName: string;
    parentId?: string | null;
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

const toMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function AccountingReportsPage() {
  const [groupBy, setGroupBy] = useState<'month' | 'quarter' | 'year'>('month');
  const [report, setReport] = useState<PnlReport | null>(null);
  const [monthToClose, setMonthToClose] = useState(new Date().toISOString().slice(0, 7));

  const loadReport = async (nextGroupBy: 'month' | 'quarter' | 'year') => {
    const now = new Date();
    const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    const result = await apiFetch<PnlReport>(`/accounting/report/pnl?from=${from}&to=${to}&groupBy=${nextGroupBy}`);
    setReport(result);
  };

  useEffect(() => {
    void loadReport(groupBy);
  }, [groupBy]);

  const chartData = useMemo(
    () =>
      (report?.periods ?? []).map((item) => ({
        period: item.period,
        收入: item.incomeCents / 100,
        费用: item.expenseCents / 100,
        净利润: item.netProfitCents / 100,
      })),
    [report],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">P&L 报表</h1>
        <div className="flex gap-2">
          <select className="rounded border px-3 py-2" value={groupBy} onChange={(e) => setGroupBy(e.target.value as 'month' | 'quarter' | 'year')}>
            <option value="month">月报</option>
            <option value="quarter">季报</option>
            <option value="year">年报</option>
          </select>
          <a className="rounded border px-3 py-2 text-sm" href={`/api/v1/accounting/export/report.csv?template=MANAGEMENT&groupBy=${groupBy}`} target="_blank" rel="noreferrer">导出管理版 CSV</a>
          <a className="rounded border px-3 py-2 text-sm" href={`/api/v1/accounting/export/report.csv?template=BOSS&groupBy=${groupBy}`} target="_blank" rel="noreferrer">导出老板版 CSV</a>
          <a className="rounded border px-3 py-2 text-sm" href={`/api/v1/accounting/export/report.pdf?template=MANAGEMENT&groupBy=${groupBy}`} target="_blank" rel="noreferrer">导出管理版 PDF</a>
          <a className="rounded border px-3 py-2 text-sm" href={`/api/v1/accounting/export/report.pdf?template=BOSS&groupBy=${groupBy}`} target="_blank" rel="noreferrer">导出老板版 PDF</a>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">月结锁账</h2>
        <div className="flex items-center gap-2">
          <input type="month" className="rounded border px-3 py-2" value={monthToClose} onChange={(e) => setMonthToClose(e.target.value)} />
          <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={async () => {
            await apiFetch(`/accounting/period-close/month/${monthToClose}`, { method: 'POST' });
            await loadReport(groupBy);
            window.alert(`${monthToClose} 锁账成功`);
          }}>执行锁账</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="收入" cents={report?.summary.incomeCents ?? 0} />
        <Card label="费用" cents={report?.summary.expenseCents ?? 0} />
        <Card label="调整" cents={report?.summary.adjustmentCents ?? 0} />
        <Card label="净利润" cents={report?.summary.netProfitCents ?? 0} />
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card label="本月净利润" cents={report?.trends.currentMonthNetCents ?? 0} />
        <Card label="上月净利润" cents={report?.trends.lastMonthNetCents ?? 0} />
        <Card label="季度累计净利润" cents={report?.trends.quarterToDateNetCents ?? 0} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">趋势图（复用 Recharts 风格）</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="收入" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="费用" stroke="#ef4444" strokeWidth={2} />
              <Line type="monotone" dataKey="净利润" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">按期间汇总</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-2 py-2">期间</th>
                <th className="px-2 py-2">收入</th>
                <th className="px-2 py-2">费用</th>
                <th className="px-2 py-2">调整</th>
                <th className="px-2 py-2">净利润</th>
                <th className="px-2 py-2">锁账</th>
              </tr>
            </thead>
            <tbody>
              {(report?.periods ?? []).map((item) => (
                <tr key={item.period} className="border-b last:border-0">
                  <td className="px-2 py-2">{item.period}</td>
                  <td className="px-2 py-2">{toMoney(item.incomeCents)}</td>
                  <td className="px-2 py-2">{toMoney(item.expenseCents)}</td>
                  <td className="px-2 py-2">{toMoney(item.adjustmentCents)}</td>
                  <td className="px-2 py-2">{toMoney(item.netProfitCents)}</td>
                  <td className="px-2 py-2">{item.isClosed ? '已锁' : '未锁'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">分类树汇总（父类自动汇总子类）</h3>
          <ul className="space-y-2 text-sm">
            {(report?.byCategoryTree ?? []).map((item) => (
              <li key={item.categoryId} className="flex justify-between border-b pb-1 last:border-0">
                <span>{item.parentId ? '└ ' : ''}{item.categoryName} ({item.type})</span>
                <span>{toMoney(item.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">来源汇总</h3>
          <ul className="space-y-2 text-sm">
            {(report?.bySource ?? []).map((item) => (
              <li key={item.source} className="flex justify-between border-b pb-1 last:border-0">
                <span>{item.source}</span>
                <span>{toMoney(item.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Card({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{toMoney(cents)}</p>
    </div>
  );
}
