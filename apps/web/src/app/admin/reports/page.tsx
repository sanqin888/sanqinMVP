'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

type DailyReport = {
  date: string;          // YYYY-MM-DD
  count: number;         // ← 注意用 count
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

function moneyFromCents(cents?: number) {
  if (typeof cents !== 'number') return '—';
  return (cents / 100).toFixed(2);
}

export default function AdminDailyReportPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fetchReport() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/reports/daily?date=${date}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DailyReport = await res.json();
      setReport(data);
    } catch (e) {
      setErr((e as Error).message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="text-3xl font-bold">每日营收报表</h1>

      <div className="flex items-center gap-3">
        <input
          type="date"
          className="rounded-md border px-3 py-2 bg-background"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          onClick={() => void fetchReport()}
          disabled={loading}
          className="rounded-md border px-4 py-2 hover:bg-accent disabled:opacity-60"
        >
          查询
        </button>
        {err && <span className="text-sm text-red-600">错误：{err}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border p-6">
          <div className="text-muted-foreground mb-2">订单数</div>
          <div className="text-4xl font-semibold">
            {typeof report?.count === 'number' ? report.count : '—'}
          </div>
        </div>

        <div className="rounded-xl border p-6">
          <div className="text-muted-foreground mb-2">不含税小计（$）</div>
          <div className="text-4xl font-semibold">{moneyFromCents(report?.subtotalCents)}</div>
        </div>

        <div className="rounded-xl border p-6">
          <div className="text-muted-foreground mb-2">税额（$）</div>
          <div className="text-4xl font-semibold">{moneyFromCents(report?.taxCents)}</div>
        </div>

        <div className="rounded-xl border p-6">
          <div className="text-muted-foreground mb-2">合计（$）</div>
          <div className="text-4xl font-semibold">{moneyFromCents(report?.totalCents)}</div>
        </div>
      </div>
    </main>
  );
}
