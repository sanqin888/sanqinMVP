'use client';

import { useEffect, useMemo, useState } from 'react';

// 你后端 API 基地址（已在 .env.local 里配了 NEXT_PUBLIC_API_BASE=http://localhost:4000）
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

// 后端返回的基础结构（尽量宽松，避免类型冲突）
type ChannelBucket = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  count: number;
};

type DailyReport = {
  date: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  count: number;
  channel?: Record<string, ChannelBucket>;
};

function toYMD(d = new Date()) {
  // 浏览器本地时区 -> YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function moneyFromCents(cents?: number) {
  if (typeof cents !== 'number') return '-';
  return (cents / 100).toFixed(2);
}

export default function AdminDailyReportPage() {
  const [date, setDate] = useState<string>(toYMD());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DailyReport | null>(null);

  const url = useMemo(
    () => `${API_BASE}/api/reports/daily?date=${encodeURIComponent(date)}`,
    [date]
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const json = (await res.json()) as DailyReport;
      setData(json);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">每日营收报表</h1>

      {/* 查询条件 */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">日期</label>
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          onClick={() => load()}
          className="rounded px-4 py-2 bg-gray-900 text-white disabled:opacity-50"
          disabled={loading}
        >
          {loading ? '查询中…' : '查询'}
        </button>
        {err && <span className="text-red-600 text-sm">错误：{err}</span>}
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="订单数" value={data?.count ?? '-'} />
        <StatCard label="不含税小计 (￥)" value={moneyFromCents(data?.subtotalCents)} />
        <StatCard label="税额 (￥)" value={moneyFromCents(data?.taxCents)} />
        <StatCard label="合计 (￥)" value={moneyFromCents(data?.totalCents)} />
      </div>

      {/* 渠道拆分 */}
      {data?.channel && (
        <div className="border rounded-lg p-4">
          <div className="font-medium mb-2">按渠道</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">渠道</th>
                  <th className="py-2 pr-4">订单数</th>
                  <th className="py-2 pr-4">不含税小计(￥)</th>
                  <th className="py-2 pr-4">税额(￥)</th>
                  <th className="py-2 pr-4">合计(￥)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.channel).map(([ch, bucket]) => {
                  const orders = bucket?.count ?? '-';
                  const subtotalCents = bucket?.subtotalCents;
                  const taxCents = bucket?.taxCents;
                  const totalCents = bucket?.totalCents;
                  return (
                    <tr key={ch} className="border-b last:border-none">
                      <td className="py-2 pr-4">{ch}</td>
                      <td className="py-2 pr-4">{orders}</td>
                      <td className="py-2 pr-4">{moneyFromCents(subtotalCents)}</td>
                      <td className="py-2 pr-4">{moneyFromCents(taxCents)}</td>
                      <td className="py-2 pr-4">{moneyFromCents(totalCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
