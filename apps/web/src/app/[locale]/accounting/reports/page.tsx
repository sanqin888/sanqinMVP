'use client';

import { useEffect, useState } from 'react';
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
  }>;
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    type: string;
    amountCents: number;
  }>;
  bySource: Array<{ source: string; amountCents: number }>;
};

export default function AccountingReportsPage() {
  const [groupBy, setGroupBy] = useState<'month' | 'quarter' | 'year'>('month');
  const [report, setReport] = useState<PnlReport | null>(null);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    void apiFetch<PnlReport>(`/accounting/report/pnl?from=${from}&to=${to}&groupBy=${groupBy}`).then(setReport);
  }, [groupBy]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">P&L 报表</h1>
        <select className="rounded border px-3 py-2" value={groupBy} onChange={(e) => setGroupBy(e.target.value as 'month' | 'quarter' | 'year')}>
          <option value="month">月报</option>
          <option value="quarter">季报</option>
          <option value="year">年报</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="收入" cents={report?.summary.incomeCents ?? 0} />
        <Card label="费用" cents={report?.summary.expenseCents ?? 0} />
        <Card label="调整" cents={report?.summary.adjustmentCents ?? 0} />
        <Card label="净利润" cents={report?.summary.netProfitCents ?? 0} />
      </div>

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
              </tr>
            </thead>
            <tbody>
              {(report?.periods ?? []).map((item) => (
                <tr key={item.period} className="border-b last:border-0">
                  <td className="px-2 py-2">{item.period}</td>
                  <td className="px-2 py-2">${(item.incomeCents / 100).toFixed(2)}</td>
                  <td className="px-2 py-2">${(item.expenseCents / 100).toFixed(2)}</td>
                  <td className="px-2 py-2">${(item.adjustmentCents / 100).toFixed(2)}</td>
                  <td className="px-2 py-2">${(item.netProfitCents / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">分类汇总</h3>
          <ul className="space-y-2 text-sm">
            {(report?.byCategory ?? []).map((item) => (
              <li key={item.categoryId} className="flex justify-between border-b pb-1 last:border-0">
                <span>{item.categoryName} ({item.type})</span>
                <span>${(item.amountCents / 100).toFixed(2)}</span>
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
                <span>${(item.amountCents / 100).toFixed(2)}</span>
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
      <p className="mt-2 text-2xl font-semibold">${(cents / 100).toFixed(2)}</p>
    </div>
  );
}
