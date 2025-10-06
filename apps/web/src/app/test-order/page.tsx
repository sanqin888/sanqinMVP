'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  qty: number;
  unitPriceCents: number | null;
  optionsJson: Record<string, unknown> | null;
};

type OrderStatus = 'pending' | 'paid' | 'making' | 'ready' | 'completed';
type Channel = 'web' | 'in_store' | 'ubereats';
type Fulfillment = 'pickup' | 'dine_in';

type Order = {
  id: string;
  status: OrderStatus;
  channel: Channel;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  fulfillmentType: Fulfillment;
  pickupCode: string;
  createdAt: string; // ISO string
  items: OrderItem[];
};

function cents(n: number): string {
  return (n / 100).toFixed(2);
}

export default function TestOrderPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchRecent = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/orders/recent`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`recent http ${res.status}`);
      const data: Order[] = await res.json();
      setOrders(data);
    } catch (e) {
      setErrorMsg((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void fetchRecent();
  }, [fetchRecent]);

  const createDemo = useCallback(async () => {
    setCreating(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 后端会按 SALES_TAX_RATE 计算税额与合计，这里给出演示小计 10
        body: JSON.stringify({
          channel: 'web',
          fulfillmentType: 'pickup',
          items: [{ productId: 'demo', qty: 1 }],
          subtotal: 10,
          taxTotal: 0,
          total: 10,
        }),
      });
      if (!res.ok) throw new Error(`create http ${res.status}`);
      await fetchRecent();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setCreating(false);
    }
  }, [fetchRecent]);

  const setPaid = useCallback(async (id: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' as OrderStatus }),
      });
      if (!res.ok) throw new Error(`setPaid http ${res.status}`);
      await fetchRecent();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fetchRecent]);

  const advance = useCallback(async (id: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/advance`, { method: 'POST' });
      if (!res.ok) throw new Error(`advance http ${res.status}`);
      await fetchRecent();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fetchRecent]);

  const nextLabel = useMemo<Record<OrderStatus, string>>(
    () => ({
      pending: '→ paid',
      paid: '→ making',
      making: '→ ready',
      ready: '→ completed',
      completed: '终态',
    }),
    [],
  );

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">下单测试 / 最近十单</h1>
        <Link
          href="/admin/reports"
          className="rounded-lg bg-neutral-800 px-3 py-2 text-white hover:opacity-90"
        >
          打开日报报表
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={createDemo}
          disabled={creating}
          className="rounded-lg border px-4 py-2 hover:bg-gray-50 disabled:opacity-60"
        >
          {creating ? '创建中…' : '创建一单（demo $10）'}
        </button>

        <button
          onClick={() => void fetchRecent()}
          disabled={loading}
          className="rounded-lg border px-4 py-2 hover:bg-gray-50 disabled:opacity-60"
        >
          刷新
        </button>

        {errorMsg && <span className="text-sm text-red-600">错误：{errorMsg}</span>}
      </div>

      <ul className="divide-y rounded-lg border">
        {orders.map((o) => (
          <li key={o.id} className="flex items-start justify-between gap-4 p-4">
            <div>
              <div className="font-medium">
                #{o.pickupCode} · {o.status.toUpperCase()} · $
                {cents(o.totalCents)}（小计 ${cents(o.subtotalCents)} / 税 ${cents(o.taxCents)}）
              </div>
              <div className="text-sm text-gray-600">
                {new Date(o.createdAt).toLocaleString()} · {o.channel} · {o.fulfillmentType}
              </div>
              <div className="text-sm text-gray-700">
                项目：{o.items.map((i) => `${i.productId}×${i.qty}`).join('，')}
              </div>
              <div className="break-all text-xs text-gray-500">ID: {o.id}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {o.status === 'pending' && (
                <button
                  onClick={() => void setPaid(o.id)}
                  className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
                >
                  标记为 paid
                </button>
              )}
              <button
                onClick={() => void advance(o.id)}
                disabled={o.status === 'completed'}
                className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                {nextLabel[o.status]}
              </button>
            </div>
          </li>
        ))}
        {orders.length === 0 && (
          <li className="p-6 text-gray-500">暂无订单，点上面的“创建一单”试试。</li>
        )}
      </ul>
    </main>
  );
}
