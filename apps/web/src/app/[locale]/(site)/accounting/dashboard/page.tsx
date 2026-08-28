'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';

type Dashboard = {
  from: string;
  to: string;
  summary: {
    incomeCents: number;
    expenseCents: number;
    adjustmentCents: number;
    netProfitCents: number;
    taxCents: number;
  };
  pending: { expenseDocuments: number };
  topExpenseCategories: Array<{
    categoryStableId: string;
    name: string;
    amountCents: number;
  }>;
  lastClosedMonth: string | null;
};

type Slice = {
  byChannel: Array<{ key: string; amountCents: number }>;
  byPaymentMethod: Array<{ key: string; amountCents: number }>;
};

const money = (cents: number | null | undefined) => `$${((cents ?? 0) / 100).toFixed(2)}`;

export default function AccountingDashboardPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const locale = isZh ? 'zh' : 'en';
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [slice, setSlice] = useState<Slice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
    };
  }, []);

  useEffect(() => {
    setError(null);
    void Promise.all([
      apiFetch<Dashboard>(`/accounting/dashboard?from=${range.from}&to=${range.to}`),
      apiFetch<Slice>(`/accounting/report/slice?from=${range.from}&to=${range.to}`),
    ])
      .then(([nextDashboard, nextSlice]) => {
        setDashboard(nextDashboard);
        setSlice(nextSlice);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [range]);

  const cards = [
    { label: isZh ? '本月收入' : 'Income', value: dashboard?.summary.incomeCents ?? 0 },
    { label: isZh ? '本月支出' : 'Expenses', value: dashboard?.summary.expenseCents ?? 0 },
    { label: isZh ? '经营净额' : 'Operating net', value: dashboard?.summary.netProfitCents ?? 0 },
    { label: isZh ? '支出 HST' : 'Expense HST', value: dashboard?.summary.taxCents ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{isZh ? '财务首页' : 'Financial dashboard'}</h1>
        <p className="mt-1 text-sm text-slate-500">{range.from} — {range.to}</p>
      </div>

      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold">{money(card.value)}</p>
          </div>
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isZh ? '待处理' : 'Needs attention'}</h2>
            <Link className="text-sm text-blue-600 hover:underline" href={`/${locale}/accounting/inbox`}>{isZh ? '打开收件箱' : 'Open inbox'}</Link>
          </div>
          <div className="mt-4 rounded-lg bg-amber-50 p-4">
            <p className="text-sm text-slate-600">{isZh ? '账单 / PDF 待确认' : 'Bills / PDFs awaiting review'}</p>
            <p className="mt-1 text-3xl font-semibold text-amber-700">{dashboard?.pending.expenseDocuments ?? 0}</p>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {isZh
              ? `最近锁账月份：${dashboard?.lastClosedMonth ?? '尚未锁账'}`
              : `Latest closed month: ${dashboard?.lastClosedMonth ?? 'none'}`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">{isZh ? '主要支出' : 'Top expenses'}</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(dashboard?.topExpenseCategories ?? []).length ? dashboard?.topExpenseCategories.map((item) => (
              <div key={item.categoryStableId} className="flex justify-between border-b border-slate-100 pb-2 last:border-0">
                <span>{item.name}</span><strong>{money(item.amountCents)}</strong>
              </div>
            )) : <p className="text-slate-500">{isZh ? '本月暂无支出数据。' : 'No expense data this month.'}</p>}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">{isZh ? '销售渠道' : 'Sales channels'}</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(slice?.byChannel ?? []).map((item) => <div key={item.key} className="flex justify-between"><span>{item.key}</span><strong>{money(item.amountCents)}</strong></div>)}
            {!slice?.byChannel?.length ? <p className="text-slate-500">{isZh ? '暂无订单数据。' : 'No order data.'}</p> : null}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">{isZh ? '支付方式' : 'Payment methods'}</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(slice?.byPaymentMethod ?? []).map((item) => <div key={item.key} className="flex justify-between"><span>{item.key}</span><strong>{money(item.amountCents)}</strong></div>)}
            {!slice?.byPaymentMethod?.length ? <p className="text-slate-500">{isZh ? '暂无订单数据。' : 'No order data.'}</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
