'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api/client';

type AnalyticsItem = {
  id: string;
  eventName: string;
  source: string;
  locale: string | null;
  path: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: string;
  createdAt: string;
};

type AnalyticsListResponse = {
  items?: AnalyticsItem[];
};

function formatDateTime(value: string, locale: 'zh' | 'en'): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed);
}

export default function AdminAnalyticsPage() {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale === 'zh' ? 'zh' : 'en';
  const isZh = locale === 'zh';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AnalyticsItem[]>([]);
  const [limit, setLimit] = useState(100);
  const [eventFilter, setEventFilter] = useState('');

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        query.set('limit', String(limit));
        if (eventFilter.trim()) query.set('event', eventFilter.trim());

        const data = await apiFetch<AnalyticsListResponse>(`/analytics/events?${query.toString()}`);
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError(isZh ? '加载埋点数据失败，请稍后重试。' : 'Failed to load analytics events.');
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchEvents();
  }, [eventFilter, isZh, limit]);

  const eventStats = useMemo(() => {
    const counter = new Map<string, number>();
    for (const item of items) {
      counter.set(item.eventName, (counter.get(item.eventName) ?? 0) + 1);
    }
    return Array.from(counter.entries())
      .map(([eventName, total]) => ({ eventName, total }))
      .sort((a, b) => b.total - a.total);
  }, [items]);

  const latestOccurredAt = items[0]?.occurredAt;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">
          {isZh ? '埋点数据分析' : 'Analytics Explorer'}
        </h1>
        <p className="text-sm text-slate-600">
          {isZh
            ? '数据来自 AnalyticsEvent 表（通过 /api/v1/analytics/events 查询）。可按事件筛选并查看最近入库数据。'
            : 'Data is read from AnalyticsEvent (via /api/v1/analytics/events). Filter by event and inspect recent records.'}
        </p>
      </header>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-slate-500">{isZh ? '当前加载条数' : 'Loaded rows'}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{items.length}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">{isZh ? '事件种类' : 'Event types'}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{eventStats.length}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">{isZh ? '最新事件时间' : 'Latest event time'}</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {latestOccurredAt
              ? formatDateTime(latestOccurredAt, locale)
              : isZh
                ? '暂无'
                : 'N/A'}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">{isZh ? '事件名筛选' : 'Event filter'}</span>
          <input
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            placeholder={isZh ? '例如 checkout_click' : 'e.g. checkout_click'}
            className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">{isZh ? '返回条数' : 'Limit'}</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">{isZh ? '事件分布' : 'Event distribution'}</h2>
          {loading ? (
            <p className="text-sm text-slate-500">{isZh ? '加载中...' : 'Loading...'}</p>
          ) : eventStats.length === 0 ? (
            <p className="text-sm text-slate-500">{isZh ? '暂无数据' : 'No data'}</p>
          ) : (
            <ul className="space-y-2">
              {eventStats.map((stat) => (
                <li key={stat.eventName} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">{stat.eventName}</span>
                  <span className="font-semibold text-slate-900">{stat.total}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">{isZh ? '最近事件明细' : 'Recent events'}</h2>
          {loading ? (
            <p className="text-sm text-slate-500">{isZh ? '加载中...' : 'Loading...'}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500">{isZh ? '暂无数据' : 'No data'}</p>
          ) : (
            <div className="max-h-[540px] overflow-auto rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">event</th>
                    <th className="px-3 py-2 text-left">path</th>
                    <th className="px-3 py-2 text-left">locale</th>
                    <th className="px-3 py-2 text-left">occurredAt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-medium">{item.eventName}</td>
                      <td className="px-3 py-2">{item.path ?? '-'}</td>
                      <td className="px-3 py-2">{item.locale ?? '-'}</td>
                      <td className="px-3 py-2">{formatDateTime(item.occurredAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
