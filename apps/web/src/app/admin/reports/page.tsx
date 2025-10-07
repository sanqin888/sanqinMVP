'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

type DailyReport = {
  orderCount: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

const money = (cents: number) => (cents / 100).toFixed(2);

export default function DailyReportPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fetchData(d: string) {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/reports/daily?date=${d}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const json: DailyReport = await res.json();
      setData(json);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchData(date); // 首次加载默认当天
  }, []); // 不自动跟随日期变更，只在点击“查询”触发

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="text-3xl font-bold">每日营收报表</h1>

      <div className="flex items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border px-3 py-2"
        />
        <button
          onClick={() => void fetchData(date)}
          disabled={loading}
          className="rounded-md bg-black text-white px-4 py-2 disabled:opacity-60"
        >
          {loading ? '查询中…' : '查询'}
        </button>
        {err && <span className="text-sm text-red-600">错误：{err}</span>}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card title="订单数">
          {typeof data?.orderCount === 'number' ? String(data.orderCount) : '—'}
        </Card>
        <Card title="不含税小计（¥）">{data ? money(data.subtotalCents) : '—'}</Card>
        <Card title="税额（¥）">{data ? money(data.taxCents) : '—'}</Card>
        <Card title="合计（¥）">{data ? money(data.totalCents) : '—'}</Card>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5">
      <div className="text-gray-500 text-sm mb-1">{title}</div>
      <div className="text-3xl font-semibold">{children}</div>
    </div>
  );
}
