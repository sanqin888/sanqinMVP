'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';
import { isStableId } from '../../../lib/stable-id';
import { ORDER_STATUS_SEQUENCE, OrderStatus } from '../../../lib/status/order';

type OrderItem = {
  id: string;
  productId: string;
  qty: number;
  unitPriceCents: number | null;
  optionsJson: Record<string, unknown> | null;
};

type OrderDetail = {
  id: string;
  status: OrderStatus;
  channel: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  fulfillmentType: string;
  pickupCode: string | null;
  createdAt: string;
  items: OrderItem[];
};

type PageProps = { params: { id: string } };

export default function OrderDetailPage({ params }: PageProps) {
  const orderId = params?.id ?? '';
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isStableId(orderId)) {
        setError('无效的订单 ID，需为 cuid/uuid');
        setLoading(false);
        return;
      }
      try {
        setError(null);
        const data = await apiFetch<OrderDetail>(`/orders/${orderId}`);
        if (!cancelled) setOrder(data);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : '订单详情加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const statusIndex = useMemo(() => {
    if (!order) return -1;
    return ORDER_STATUS_SEQUENCE.indexOf(order.status);
  }, [order]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">订单详情</h1>
          <p className="text-sm text-gray-500 break-all">ID: {orderId}</p>
        </div>
        <Link href="/test-order" className="text-sm text-blue-600 hover:underline">
          ← 返回测试面板
        </Link>
      </div>

      {loading && <div className="text-gray-500">加载中…</div>}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {order && !loading && !error && (
        <section className="space-y-4 rounded-lg border p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <span className="rounded bg-gray-900 px-2 py-1 text-xs font-medium uppercase tracking-wide text-white">
              {order.status}
            </span>
            {order.pickupCode && (
              <span className="text-sm text-gray-600">取餐码：{order.pickupCode}</span>
            )}
            <span className="text-sm text-gray-600">
              渠道：{order.channel} · {order.fulfillmentType}
            </span>
            <span className="text-sm text-gray-500">
              创建时间：{new Date(order.createdAt).toLocaleString()}
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">金额</h2>
            <ul className="text-sm text-gray-600">
              <li>小计：${(order.subtotalCents / 100).toFixed(2)}</li>
              <li>税额：${(order.taxCents / 100).toFixed(2)}</li>
              <li className="font-medium text-gray-900">
                合计：${(order.totalCents / 100).toFixed(2)}
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">状态流转</h2>
            <ol className="flex flex-wrap gap-2 text-xs text-gray-500">
              {ORDER_STATUS_SEQUENCE.map((status, idx) => (
                <li
                  key={status}
                  className={`rounded-full border px-3 py-1 ${
                    idx <= statusIndex
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200'
                  }`}
                >
                  {status}
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">项目列表</h2>
            <ul className="space-y-2 text-sm text-gray-700">
              {order.items.map((item) => (
                <li key={item.id} className="rounded border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span>{item.productId}</span>
                    <span>×{item.qty}</span>
                  </div>
                  {typeof item.unitPriceCents === 'number' && (
                    <div className="text-xs text-gray-500">
                      单价：${(item.unitPriceCents / 100).toFixed(2)}
                    </div>
                  )}
                  {item.optionsJson && Object.keys(item.optionsJson).length > 0 && (
                    <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-gray-500">
                      {JSON.stringify(item.optionsJson, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="text-xs text-gray-500">
            深链规范：<code className="rounded bg-gray-100 px-1 py-0.5">sanqin://order/{order.id}</code>
          </div>
        </section>
      )}
    </main>
  );
}
