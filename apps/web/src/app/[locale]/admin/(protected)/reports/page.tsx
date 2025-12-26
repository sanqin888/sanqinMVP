//Users/apple/sanqinMVP/apps/web/src/app/[locale]/admin/reports/page.tsx

'use client';

import { useState } from 'react';

const RAW_API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

type DailyReport = {
  date?: string;          // YYYY-MM-DD （可选）
  count: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

function moneyFromCents(cents?: number) {
  if (typeof cents !== 'number') return '—';
  return (cents / 100).toFixed(2);
}

/**
 * 根据 NEXT_PUBLIC_API_BASE 拼接最终的 /reports/daily URL
 */
function buildDailyUrl(dateISO: string) {
  const base = RAW_API_BASE.replace(/\/+$/, ''); // 去掉结尾斜杠
  let urlBase: string;

  if (!base) {
    urlBase = '/api/v1';
  } else if (/\/api\/v\d+$/i.test(base)) {
    urlBase = base;                   // .../api/v1
  } else if (/\/api$/i.test(base)) {
    urlBase = `${base}/v1`;           // .../api → .../api/v1
  } else {
    urlBase = `${base}/api/v1`;       // ... → .../api/v1
  }

  return `${urlBase}/reports/daily?date=${encodeURIComponent(dateISO)}`;
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
      const url = buildDailyUrl(date);

      const res = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      const ct = res.headers.get('content-type') || '';

      if (!res.ok) {
        const msg = ct.includes('application/json')
          ? JSON.stringify(await res.json())
          : await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }

      if (!ct.includes('application/json')) {
        const text = await res.text();
        throw new Error(
          `非 JSON 响应（content-type=${ct}）：${text.slice(0, 160)}`
        );
      }

      // ✅ 兼容“信封结构”和“直接数据结构”
      const raw = await res.json();
      const data: DailyReport = ('details' in raw ? raw.details : raw) as DailyReport;

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
