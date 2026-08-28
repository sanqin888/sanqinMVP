'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';

type Slice = {
  byChannel: Array<{ key: string; amountCents: number }>;
  byPaymentMethod: Array<{ key: string; amountCents: number }>;
};

type Pnl = {
  summary: {
    incomeCents: number;
    expenseCents: number;
    adjustmentCents: number;
    netProfitCents: number;
  };
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function AccountingSalesPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [slice, setSlice] = useState<Slice | null>(null);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    void Promise.all([
      apiFetch<Slice>(`/accounting/report/slice?from=${from}&to=${to}`),
      apiFetch<Pnl>(`/accounting/report/pnl?from=${from}&to=${to}&groupBy=month`),
    ])
      .then(([nextSlice, nextPnl]) => {
        setSlice(nextSlice);
        setPnl(nextPnl);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [from, to]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{isZh ? '销售' : 'Sales'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '这里直接读取 SanQ 订单数据。销售自动形成正式财务分录的拆分规则将在销售财务化阶段接入。'
            : 'This view reads SanQ order data directly. Formal revenue/tax/refund ledger posting remains a separate accounting phase.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <input type="date" className="rounded border px-3 py-2 text-sm" value={from} onChange={(event) => setFrom(event.target.value)} />
        <span className="self-center text-slate-400">→</span>
        <input type="date" className="rounded border px-3 py-2 text-sm" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">{isZh ? 'Accounting 已入账收入' : 'Posted accounting income'}</p><p className="mt-2 text-2xl font-semibold">{money(pnl?.summary.incomeCents ?? 0)}</p></div>
        <div className="rounded-xl border bg-white p-4 lg:col-span-2"><p className="text-sm text-slate-500">{isZh ? '说明' : 'Note'}</p><p className="mt-2 text-sm text-slate-700">{isZh ? '订单销售不能简单把 totalCents 当营业收入；税、优惠、配送、surcharge、退款和储值需要在下一阶段按统一规则拆分。' : 'Order total cannot be treated as revenue directly. Tax, discounts, delivery, surcharge, refunds and store balance need explicit posting rules.'}</p></div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">{isZh ? '按渠道' : 'By channel'}</h2><div className="mt-3 space-y-2 text-sm">{(slice?.byChannel ?? []).map((row) => <div key={row.key} className="flex justify-between border-b pb-2 last:border-0"><span>{row.key}</span><strong>{money(row.amountCents)}</strong></div>)}</div></div>
        <div className="rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">{isZh ? '按支付方式' : 'By payment method'}</h2><div className="mt-3 space-y-2 text-sm">{(slice?.byPaymentMethod ?? []).map((row) => <div key={row.key} className="flex justify-between border-b pb-2 last:border-0"><span>{row.key}</span><strong>{money(row.amountCents)}</strong></div>)}</div></div>
      </section>
    </div>
  );
}
