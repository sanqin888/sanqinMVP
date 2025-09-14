'use client';
import { useState } from 'react';

type OrderResp = { id: string; pickupCode: string; [k: string]: unknown };

export default function TestOrderPage() {
  const [data, setData] = useState<OrderResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

  const submit = async () => {
    setErr(null);
    setData(null);
    try {
      const res = await fetch(`${base}/api/orders`, {
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
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
      const json = (await res.json()) as OrderResp;
      setData(json);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>下单 API 测试</h1>
      <button onClick={submit}>提交一个测试订单</button>
      <pre style={{ background: '#f3f4f6', padding: 12, marginTop: 16 }}>
        {err ? `ERROR: ${err}` : JSON.stringify(data, null, 2)}
      </pre>
    </main>
  );
}
