'use client';

import { useState } from 'react';

type Channel = 'web' | 'in_store' | 'ubereats';
type Fulfillment = 'pickup' | 'dine_in';

type OrderItem = {
  productId: string;
  qty: number;
  options?: Record<string, unknown>; // ← 不用 any
};

type CreateOrder = {
  channel: Channel;
  items: OrderItem[];
  subtotal: number;   // 不含税
  taxTotal: number;   // 税额
  total: number;      // 含税总额
  fulfillmentType: Fulfillment;
};

type OrderResp = {
  id: string;
  pickupCode: string;
  status: string;
  createdAt: string;
  channel: Channel;
  items: { productId: string; qty: number }[];
  subtotal: number;
  taxTotal: number;
  total: number;
  fulfillmentType: Fulfillment;
};

export default function TestOrderPage() {
  const [resp, setResp] = useState<OrderResp | null>(null); // ← 不用 any

  const submit = async (e: React.MouseEvent<HTMLButtonElement>) => { // ← 不用 any
    e.preventDefault();

    const payload: CreateOrder = {
      channel: 'web',
      items: [{ productId: 'p_1', qty: 1 }],
      subtotal: 12.99,
      taxTotal: 1.69,
      total: 14.68,
      fulfillmentType: 'pickup',
    };

    const r = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json: OrderResp = await r.json();
    setResp(json);
  };

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">下单 API 测试</h1>
      <button className="bg-black text-white rounded px-4 py-2" onClick={submit}>
        提交一个测试订单
      </button>

      <pre className="bg-gray-100 p-4 mt-6 rounded text-sm overflow-auto">
        {JSON.stringify(resp, null, 2)}
      </pre>
    </main>
  );
}
