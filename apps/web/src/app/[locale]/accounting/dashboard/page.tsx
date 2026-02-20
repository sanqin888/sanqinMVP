'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';

type Tx = {
  txStableId: string;
  type: 'INCOME' | 'EXPENSE' | 'ADJUSTMENT';
  source: string;
  amountCents: number;
  occurredAt: string;
  memo?: string | null;
};

type Pnl = {
  summary: {
    incomeCents: number;
    expenseCents: number;
    adjustmentCents: number;
    netProfitCents: number;
  };
};

export default function AccountingDashboardPage() {
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [recent, setRecent] = useState<Tx[]>([]);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const to = now.toISOString().slice(0, 10);

    void apiFetch<Pnl>(`/accounting/report/pnl?from=${from}&to=${to}&groupBy=month`).then(setPnl);
    void apiFetch<Tx[]>('/accounting/tx?from=' + from + '&to=' + to).then((rows) =>
      setRecent(rows.slice(0, 8)),
    );
  }, []);

  const cards = useMemo(() => {
    const summary = pnl?.summary;
    return [
      { label: '收入', value: summary?.incomeCents ?? 0, color: 'text-emerald-600' },
      { label: '费用', value: summary?.expenseCents ?? 0, color: 'text-red-600' },
      { label: '调整', value: summary?.adjustmentCents ?? 0, color: 'text-amber-600' },
      { label: '净利润', value: summary?.netProfitCents ?? 0, color: 'text-blue-600' },
    ];
  }, [pnl]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">财务看板（当月）</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${card.color}`}>${(card.value / 100).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">最近流水</h2>
          <Link href="./transactions" className="text-sm text-blue-600 hover:underline">
            查看全部
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-2 py-2">时间</th>
                <th className="px-2 py-2">类型</th>
                <th className="px-2 py-2">来源</th>
                <th className="px-2 py-2">金额</th>
                <th className="px-2 py-2">备注</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((tx) => (
                <tr key={tx.txStableId} className="border-b last:border-0">
                  <td className="px-2 py-2">{new Date(tx.occurredAt).toLocaleDateString()}</td>
                  <td className="px-2 py-2">{tx.type}</td>
                  <td className="px-2 py-2">{tx.source}</td>
                  <td className="px-2 py-2">${(tx.amountCents / 100).toFixed(2)}</td>
                  <td className="px-2 py-2">{tx.memo ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
