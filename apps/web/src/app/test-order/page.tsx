'use client';
import { useState } from 'react';

export default function TestOrderPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    try {
      setLoading(true);
      const base = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
      const res = await fetch(`${base}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'web',
          items: [{ productId: 'p_1', qty: 1 }],
          subtotal: 12.99, taxTotal: 1.69, total: 14.68,
          fulfillmentType: 'pickup'
        })
      });
      setResult(await res.json());
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold">下单 API 测试</h1>
      <button
        className="mt-4 px-4 py-2 rounded text-white"
        style={{ background: 'var(--brand, #8C3A2B)' }}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? '提交中…' : '提交一个测试订单'}
      </button>
      <pre className="mt-4 bg-gray-100 p-3 rounded text-sm overflow-auto">
        {JSON.stringify(result, null, 2)}
      </pre>
    </main>
  );
}
