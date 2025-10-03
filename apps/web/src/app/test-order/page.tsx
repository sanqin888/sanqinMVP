'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

type OrderItem = {
  id: string;
  productId: string;
  qty: number;
  unitPriceCents: number | null;
  optionsJson?: unknown | null;
};

type Order = {
  id: string;
  createdAt: string;
  channel: string;
  fulfillmentType: string;
  status: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  pickupCode: string;
  items: OrderItem[];
};

function cents(n: number) {
  return (n / 100).toFixed(2);
}

function errorMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return fallback;
  }
}

export default function TestOrderPage() {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Order | null>(null);
  const [recent, setRecent] = useState<Order[] | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createTestOrder() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'web',
          fulfillmentType: 'pickup',
          items: [{ productId: 'demo', qty: 1 }],
          subtotal: 10,
          taxTotal: 0,
          total: 10,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST /api/orders -> ${res.status}: ${text}`);
      }
      const data = (await res.json()) as Order;
      setCreated(data);
    } catch (e: unknown) {
      setError(errorMessage(e, '下单失败'));
    } finally {
      setCreating(false);
    }
  }

  async function fetchRecent(limit = 10) {
    setLoadingRecent(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/orders/recent?limit=${limit}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GET /api/orders/recent -> ${res.status}: ${text}`);
      }
      const list = (await res.json()) as Order[];
      setRecent(list);
    } catch (e: unknown) {
      setError(errorMessage(e, '获取最近订单失败'));
    } finally {
      setLoadingRecent(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">测试下单 / 最近订单</h1>

      <section className="space-x-3">
        <button
          onClick={createTestOrder}
          disabled={creating}
          className="rounded-lg border px-4 py-2 hover:bg-gray-50 disabled:opacity-60"
        >
          {creating ? '下单中…' : '下单测试（￥10.00）'}
        </button>

        <button
          onClick={() => fetchRecent(10)}
          disabled={loadingRecent}
          className="rounded-lg border px-4 py-2 hover:bg-gray-50 disabled:opacity-60"
        >
          {loadingRecent ? '加载中…' : '查看最近 10 单'}
        </button>
      </section>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      {created && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">最新创建的订单</h2>
          <pre className="overflow-auto text-sm">{JSON.stringify(created, null, 2)}</pre>
        </section>
      )}

      {recent && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 font-medium">最近订单</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">订单ID</th>
                  <th className="px-3 py-2">渠道</th>
                  <th className="px-3 py-2">取餐码</th>
                  <th className="px-3 py-2">总额</th>
                  <th className="px-3 py-2">明细数</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="px-3 py-2">{new Date(o.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono">{o.id.slice(0, 8)}…</td>
                    <td className="px-3 py-2">{o.channel}</td>
                    <td className="px-3 py-2">{o.pickupCode}</td>
                    <td className="px-3 py-2">￥{cents(o.totalCents)}</td>
                    <td className="px-3 py-2">{o.items?.length ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
