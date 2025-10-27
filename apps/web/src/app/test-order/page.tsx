'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

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
  createdAt: string;
  items: OrderItem[];
};

type PrintJobType = 'receipt' | 'kitchen';
type PrintJob = {
  id: string;
  orderId: string;
  pickupCode: string;
  type: PrintJobType;
  createdAt: number;
  content: string;
};

function cents(n: number): string {
  return (n / 100).toFixed(2);
}

function buildPrintContent(order: Order, type: PrintJobType): string {
  const lines: string[] = [];
  const createdAt = new Date(order.createdAt).toLocaleString();

  if (type === 'receipt') {
    lines.push('SANQIN CAFE');
    lines.push(`订单号: ${order.pickupCode}`);
    lines.push(`渠道: ${order.channel} · ${order.fulfillmentType}`);
    lines.push(`时间: ${createdAt}`);
    lines.push('------------------------------');
    order.items.forEach((item) => { lines.push(`${item.productId}  x${item.qty}`); });
    lines.push('------------------------------');
    lines.push(`小计: $${cents(order.subtotalCents)}`);
    lines.push(`税额: $${cents(order.taxCents)}`);
    lines.push(`合计: $${cents(order.totalCents)}`);
    lines.push('谢谢惠顾，欢迎再次光临!');
  } else {
    lines.push('后厨联 · 准备中');
    lines.push(`取餐码: ${order.pickupCode}`);
    lines.push(`下单渠道: ${order.channel}`);
    lines.push(`下单时间: ${createdAt}`);
    lines.push('------------------------------');
    order.items.forEach((item) => {
      const price = typeof item.unitPriceCents === 'number' ? `@$${cents(item.unitPriceCents)}` : '';
      lines.push(`${item.productId} x${item.qty} ${price}`.trim());
      if (item.optionsJson && Object.keys(item.optionsJson).length > 0) {
        lines.push(`  选项: ${JSON.stringify(item.optionsJson)}`);
      }
    });
    lines.push('------------------------------');
    lines.push('提醒: 保持制作顺序，注意过敏源标识。');
  }
  return lines.join('\n');
}

export default function TestOrderPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);

  const fetchRecent = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/orders/recent', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`recent http ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const body = await res.text();
        throw new Error(`recent non-JSON（${ct || 'unknown'}）。返回片段：` + body.slice(0, 180).replace(/\s+/g, ' '));
      }
      const data: Order[] = await res.json();
      setOrders(data);
    } catch (e) {
      setErrorMsg((e as Error).message);
      setOrders([]);
    }
  }, []);

  useEffect(() => { void fetchRecent(); }, [fetchRecent]);

  const createDemo = useCallback(async () => {
    setCreating(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ channel: 'web', fulfillmentType: 'pickup', items: [{ productId: 'demo', qty: 1 }], subtotal: 10, taxTotal: 0, total: 10 }),
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
      const res = await fetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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

  // —— 关键：模拟 Clover 支付，20s 超时 + 明确错误展示 ——
  const simulateCloverPay = useCallback(async (id: string) => {
    setLoading(true);
    setErrorMsg(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000); // 20s

    try {
      const res = await fetch('/api/clover/pay/online/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ orderId: id, result: 'SUCCESS' }),
        signal: controller.signal,
      });

      const raw = await res.text().catch(() => '');
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

      if (!res.ok) {
        throw new Error(`simulate http ${res.status} ${res.statusText} :: ${raw.slice(0, 200).replace(/\s+/g, ' ')}`);
      }
      if (!data?.ok) {
        setErrorMsg(`Clover 返回未成功：${JSON.stringify(data).slice(0, 200)}`);
      }
      await fetchRecent();
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setErrorMsg('支付模拟超时(20s)：请检查密钥/网络/防火墙或稍后再试');
      } else {
        setErrorMsg(e?.message || '支付模拟失败');
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [fetchRecent]);

  const advance = useCallback(async (id: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/orders/${id}/advance`, { method: 'POST' });
      if (!res.ok) throw new Error(`advance http ${res.status}`);
      await fetchRecent();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fetchRecent]);

  const nextLabel = useMemo<Record<OrderStatus, string>>(
    () => ({ pending: '→ paid', paid: '→ making', making: '→ ready', ready: '→ completed', completed: '终态' }),
    []
  );

  const groupedJobs = useMemo(
    () => printJobs.reduce<{ receipt: PrintJob[]; kitchen: PrintJob[] }>((acc, job) => { acc[job.type].push(job); return acc; }, { receipt: [], kitchen: [] }),
    [printJobs]
  );

  const simulatePrint = useCallback((order: Order, type: PrintJobType) => {
    const job: PrintJob = { id: `${order.id}-${type}-${Date.now()}`, orderId: order.id, pickupCode: order.pickupCode, type, createdAt: Date.now(), content: buildPrintContent(order, type) };
    setPrintJobs((prev) => [job, ...prev]);
  }, []);

  const formatTimestamp = useCallback((ts: number) => new Date(ts).toLocaleTimeString(), []);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">下单测试 / 最近十单</h1>
        <Link href="/admin/reports" className="rounded-lg bg-neutral-800 px-3 py-2 text-white hover:opacity-90">打开日报报表</Link>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={createDemo} disabled={creating} className="rounded-lg border px-4 py-2 hover:bg-gray-50 disabled:opacity-60">
          {creating ? '创建中…' : '创建一单（demo $10）'}
        </button>

        <button onClick={() => void fetchRecent()} disabled={loading} className="rounded-lg border px-4 py-2 hover:bg-gray-50 disabled:opacity-60">
          刷新
        </button>

        {errorMsg && <span className="text-sm text-red-600 break-all">{errorMsg}</span>}
      </div>

      <ul className="divide-y rounded-lg border">
        {orders.map((o) => (
          <li key={o.id} className="flex items-start justify-between gap-4 p-4">
            <div>
              <div className="font-medium">
                #{o.pickupCode} · {o.status.toUpperCase()} · ${cents(o.totalCents)}（小计 ${cents(o.subtotalCents)} / 税 ${cents(o.taxCents)}）
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
                <>
                  <button onClick={() => void simulateCloverPay(o.id)} className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50">
                    模拟在线支付（Clover）
                  </button>
                  <button onClick={() => void setPaid(o.id)} className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50">
                    直接标记为 paid
                  </button>
                </>
              )}
              <button onClick={() => void advance(o.id)} disabled={o.status === 'completed'} className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-60">
                {nextLabel[o.status]}
              </button>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button onClick={() => simulatePrint(o, 'receipt')} className="rounded border px-3 py-1 text-xs hover:bg-gray-50">模拟前台打印</button>
                <button onClick={() => simulatePrint(o, 'kitchen')} className="rounded border px-3 py-1 text-xs hover:bg-gray-50">模拟后厨打印</button>
              </div>
            </div>
          </li>
        ))}
        {orders.length === 0 && <li className="p-6 text-gray-500">暂无订单，点上面的“创建一单”试试。</li>}
      </ul>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">打印模拟面板</h2>
        <p className="text-sm text-gray-600">点击订单操作中的“模拟前台打印”或“模拟后厨打印”按钮后，这里会显示对应的打印内容，便于调试与确认格式。</p>
        <div className="grid gap-4 md:grid-cols-2">
          <PrintPreview title="前台收据（RECEIPT）" jobs={groupedJobs.receipt} formatTime={formatTimestamp} />
          <PrintPreview title="后厨小票（KITCHEN）" jobs={groupedJobs.kitchen} formatTime={formatTimestamp} />
        </div>
      </section>
    </main>
  );
}

type PrintPreviewProps = {
  title: string;
  jobs: PrintJob[];
  formatTime: (ts: number) => string;
};

function PrintPreview({ title, jobs, formatTime }: PrintPreviewProps) {
  return (
    <div className="flex h-full flex-col rounded-lg border">
      <div className="border-b px-4 py-3 text-sm font-medium uppercase tracking-wide text-gray-600">{title}</div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {jobs.length === 0 && <div className="text-gray-400">暂无打印任务。</div>}
        {jobs.map((job) => (
          <article key={job.id} className="space-y-1 rounded-md bg-gray-50 p-3">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>#{job.pickupCode}</span>
              <span>{formatTime(job.createdAt)}</span>
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-gray-800">{job.content}</pre>
          </article>
        ))}
      </div>
    </div>
  );
}
