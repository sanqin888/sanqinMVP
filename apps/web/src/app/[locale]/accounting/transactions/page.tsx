'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type Category = {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'ADJUSTMENT';
};

type Tx = {
  txStableId: string;
  type: 'INCOME' | 'EXPENSE' | 'ADJUSTMENT';
  source: 'ORDER' | 'MANUAL' | 'UBER' | 'FANTUAN' | 'OTHER';
  amountCents: number;
  occurredAt: string;
  categoryId: string;
  orderId?: string | null;
  memo?: string | null;
};

const initialForm = {
  type: 'INCOME' as Tx['type'],
  source: 'MANUAL' as Tx['source'],
  amountCents: 0,
  occurredAt: new Date().toISOString().slice(0, 10),
  categoryId: '',
  orderId: '',
  memo: '',
};

export default function TransactionsPage() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [tx, cats] = await Promise.all([
      apiFetch<Tx[]>('/accounting/tx'),
      apiFetch<Category[]>('/accounting/categories'),
    ]);
    setRows(tx);
    setCategories(cats);
    if (!form.categoryId && cats[0]) {
      setForm((prev) => ({ ...prev, categoryId: cats[0].id }));
    }
  }, [form.categoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCategories = useMemo(
    () => categories.filter((cat) => cat.type === form.type),
    [categories, form.type],
  );

  useEffect(() => {
    if (filteredCategories.length && !filteredCategories.some((c) => c.id === form.categoryId)) {
      setForm((prev) => ({ ...prev, categoryId: filteredCategories[0].id }));
    }
  }, [filteredCategories, form.categoryId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...form,
      amountCents: Number(form.amountCents),
      orderId: form.orderId || null,
      memo: form.memo || null,
      occurredAt: form.occurredAt,
    };

    if (editingId) {
      await apiFetch(`/accounting/tx/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch('/accounting/tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    setForm(initialForm);
    setEditingId(null);
    await load();
  }

  async function onDelete(txStableId: string) {
    if (!window.confirm('确认删除此流水？')) return;
    await apiFetch(`/accounting/tx/${txStableId}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">流水管理</h1>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <select className="rounded border px-3 py-2" value={form.type} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value as Tx['type'] }))}>
          <option value="INCOME">INCOME</option>
          <option value="EXPENSE">EXPENSE</option>
          <option value="ADJUSTMENT">ADJUSTMENT</option>
        </select>

        <select className="rounded border px-3 py-2" value={form.source} onChange={(e) => setForm((s) => ({ ...s, source: e.target.value as Tx['source'] }))}>
          <option value="MANUAL">MANUAL</option>
          <option value="ORDER">ORDER</option>
          <option value="UBER">UBER</option>
          <option value="FANTUAN">FANTUAN</option>
          <option value="OTHER">OTHER</option>
        </select>

        <select className="rounded border px-3 py-2" value={form.categoryId} onChange={(e) => setForm((s) => ({ ...s, categoryId: e.target.value }))}>
          {filteredCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        <input className="rounded border px-3 py-2" type="number" placeholder="amountCents" value={form.amountCents} onChange={(e) => setForm((s) => ({ ...s, amountCents: Number(e.target.value) }))} />
        <input className="rounded border px-3 py-2" type="date" value={form.occurredAt} onChange={(e) => setForm((s) => ({ ...s, occurredAt: e.target.value }))} />
        <input className="rounded border px-3 py-2" placeholder="orderStableId (source=ORDER 必填)" value={form.orderId} onChange={(e) => setForm((s) => ({ ...s, orderId: e.target.value }))} />
        <input className="rounded border px-3 py-2 md:col-span-2" placeholder="备注" value={form.memo} onChange={(e) => setForm((s) => ({ ...s, memo: e.target.value }))} />

        <button className="rounded bg-slate-900 px-4 py-2 text-white md:col-span-2" type="submit">
          {editingId ? '更新流水' : '新增流水'}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">流水列表</h2>
          <a className="text-sm text-blue-600 hover:underline" href="/api/v1/accounting/export/tx.csv" target="_blank" rel="noreferrer">
            导出 CSV
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-2 py-2">日期</th>
                <th className="px-2 py-2">类型</th>
                <th className="px-2 py-2">来源</th>
                <th className="px-2 py-2">金额</th>
                <th className="px-2 py-2">备注</th>
                <th className="px-2 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.txStableId} className="border-b last:border-0">
                  <td className="px-2 py-2">{new Date(row.occurredAt).toLocaleDateString()}</td>
                  <td className="px-2 py-2">{row.type}</td>
                  <td className="px-2 py-2">{row.source}</td>
                  <td className="px-2 py-2">${(row.amountCents / 100).toFixed(2)}</td>
                  <td className="px-2 py-2">{row.memo ?? '-'}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button className="text-blue-600 hover:underline" onClick={() => {
                        setEditingId(row.txStableId);
                        setForm({
                          type: row.type,
                          source: row.source,
                          amountCents: row.amountCents,
                          occurredAt: row.occurredAt.slice(0, 10),
                          categoryId: row.categoryId,
                          orderId: row.orderId ?? '',
                          memo: row.memo ?? '',
                        });
                      }}>编辑</button>
                      <button className="text-red-600 hover:underline" onClick={() => void onDelete(row.txStableId)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
