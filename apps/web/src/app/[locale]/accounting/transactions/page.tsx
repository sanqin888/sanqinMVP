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
  attachmentUrls?: string[];
};

type PeriodClose = {
  periodKey: string;
};

const initialForm = {
  type: 'INCOME' as Tx['type'],
  source: 'MANUAL' as Tx['source'],
  amountCents: 0,
  occurredAt: new Date().toISOString().slice(0, 10),
  categoryId: '',
  orderId: '',
  memo: '',
  attachmentUrlsText: '',
};

const toMonthKey = (date: string) => date.slice(0, 7);

export default function TransactionsPage() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [closedMonths, setClosedMonths] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [tx, cats] = await Promise.all([
      apiFetch<Tx[]>('/accounting/tx?limit=50'),
      apiFetch<Category[]>('/accounting/categories'),
    ]);
    setRows(tx);
    setCategories(cats);

    const months = Array.from(new Set(tx.map((item) => toMonthKey(item.occurredAt)).filter(Boolean)));
    if (months.length) {
      const closeRows = await apiFetch<PeriodClose[]>(
        `/accounting/period-close/month?periodKeys=${encodeURIComponent(months.join(','))}`,
      );
      setClosedMonths(new Set(closeRows.map((item) => item.periodKey)));
    } else {
      setClosedMonths(new Set());
    }

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
    if (isSubmitting) return;

    const payload = {
      ...form,
      amountCents: Number(form.amountCents),
      orderId: form.orderId || null,
      memo: form.memo || null,
      occurredAt: form.occurredAt,
      attachmentUrls: form.attachmentUrlsText
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    };

    setIsSubmitting(true);
    try {
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
    } finally {
      setIsSubmitting(false);
    }
  }

  async function uploadAttachment(file: File) {
    setUploadError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch<{ url: string }>('/admin/upload/image', {
        method: 'POST',
        body: formData,
      });

      setForm((prev) => {
        const urls = prev.attachmentUrlsText
          .split(/\n|,/)
          .map((item) => item.trim())
          .filter(Boolean);
        return {
          ...prev,
          attachmentUrlsText: [...urls, res.url].join('\n'),
        };
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsUploading(false);
    }
  }

  async function onDelete(txStableId: string) {
    if (!window.confirm('确认删除此流水？')) return;
    await apiFetch(`/accounting/tx/${txStableId}`, { method: 'DELETE' });
    await load();
  }

  const canEditRow = (row: Tx) => {
    const isClosed = closedMonths.has(toMonthKey(row.occurredAt));
    if (!isClosed) return true;
    return row.type === 'ADJUSTMENT';
  };

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
        <div className="md:col-span-2 space-y-2 rounded border border-dashed border-slate-300 bg-slate-50 p-3">
          <p className="text-sm text-slate-600">上传凭证附件（支持拖拽或点击上传）</p>
          <label className="inline-flex cursor-pointer items-center rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={isUploading || isSubmitting}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void uploadAttachment(file);
                e.currentTarget.value = '';
              }}
            />
            {isUploading ? '上传中…' : '选择图片'}
          </label>
          <div
            className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-500"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (isUploading || isSubmitting) return;
              const file = e.dataTransfer.files?.[0];
              if (!file) return;
              void uploadAttachment(file);
            }}
          >
            将图片拖拽到此区域以上传
          </div>
          {uploadError ? <p className="text-sm text-red-600">上传失败：{uploadError}</p> : null}
          {form.attachmentUrlsText ? (
            <div className="space-y-1 rounded border border-slate-200 bg-white p-3">
              {form.attachmentUrlsText
                .split(/\n|,/)
                .map((item) => item.trim())
                .filter(Boolean)
                .map((url) => (
                  <div key={url} className="flex items-center justify-between gap-2 text-sm">
                    <a className="truncate text-blue-600 hover:underline" href={url} target="_blank" rel="noreferrer">{url}</a>
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          attachmentUrlsText: prev.attachmentUrlsText
                            .split(/\n|,/)
                            .map((item) => item.trim())
                            .filter((item) => item && item !== url)
                            .join('\n'),
                        }));
                      }}
                    >
                      移除
                    </button>
                  </div>
                ))}
            </div>
          ) : null}
        </div>

        <div className="md:col-span-2 flex flex-wrap gap-2">
          <button className="rounded bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSubmitting || isUploading}>
            {isSubmitting ? '提交中…' : editingId ? '更新流水' : '新增流水'}
          </button>
          <button type="button" className="rounded border border-slate-300 px-4 py-2" onClick={() => {
            const last = rows[0];
            if (!last) return;
            setEditingId(null);
            setForm({
              type: last.type,
              source: last.source,
              amountCents: last.amountCents,
              occurredAt: new Date().toISOString().slice(0, 10),
              categoryId: last.categoryId,
              orderId: last.orderId ?? '',
              memo: last.memo ?? '',
              attachmentUrlsText: (last.attachmentUrls ?? []).join('\n'),
            });
          }}>复制上一条</button>
          {editingId ? (
            <button type="button" className="rounded border border-slate-300 px-4 py-2" onClick={() => {
              setEditingId(null);
              setForm(initialForm);
            }}>取消编辑</button>
          ) : null}
        </div>
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
                <th className="px-2 py-2">附件</th>
                <th className="px-2 py-2">状态</th>
                <th className="px-2 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const monthClosed = closedMonths.has(toMonthKey(row.occurredAt));
                const editable = canEditRow(row);
                return (
                  <tr key={row.txStableId} className="border-b last:border-0">
                    <td className="px-2 py-2">{new Date(row.occurredAt).toLocaleDateString()}</td>
                    <td className="px-2 py-2">{row.type}</td>
                    <td className="px-2 py-2">{row.source}</td>
                    <td className="px-2 py-2">${(row.amountCents / 100).toFixed(2)}</td>
                    <td className="px-2 py-2">{row.memo ?? '-'}</td>
                    <td className="px-2 py-2">
                      <div className="space-y-1">
                        {(row.attachmentUrls ?? []).slice(0, 2).map((url) => (
                          <div key={url}>
                            <a className="text-blue-600 hover:underline" href={url} target="_blank" rel="noreferrer">预览附件</a>
                            {url.match(/\.(png|jpe?g|gif|webp)$/i) ? <img src={url} alt="附件预览" className="mt-1 h-10 w-10 rounded object-cover" /> : null}
                          </div>
                        ))}
                        {(row.attachmentUrls ?? []).length === 0 ? '-' : null}
                      </div>
                    </td>
                    <td className="px-2 py-2">{monthClosed ? '已锁账' : '未锁账'}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-2">
                        <button disabled={!editable} className="text-blue-600 hover:underline disabled:text-slate-300" onClick={() => {
                          setEditingId(row.txStableId);
                          setForm({
                            type: row.type,
                            source: row.source,
                            amountCents: row.amountCents,
                            occurredAt: row.occurredAt.slice(0, 10),
                            categoryId: row.categoryId,
                            orderId: row.orderId ?? '',
                            memo: row.memo ?? '',
                            attachmentUrlsText: (row.attachmentUrls ?? []).join('\n'),
                          });
                        }}>编辑</button>
                        <button disabled={!editable} className="text-red-600 hover:underline disabled:text-slate-300" onClick={() => void onDelete(row.txStableId)}>删除</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
