'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';

type Category = {
  categoryStableId: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'ADJUSTMENT' | 'TRANSFER';
  parentStableId: string | null;
  sortOrder: number;
};

type Account = {
  accountStableId: string;
  name: string;
  type: 'CASH' | 'BANK' | 'PLATFORM_WALLET';
  currency: string;
};

type ExpenseDocument = {
  documentStableId: string;
  occurredAt: string | null;
  totalCents: number | null;
  taxCents: number | null;
  memo: string | null;
  attachmentUrls: string[];
  splits: Array<{
    txStableId: string;
    categoryName: string;
    amountCents: number;
    taxCents: number;
  }>;
};

type TaxMode = 'EXEMPT' | 'HST13' | 'MANUAL';
type SplitDraft = {
  key: string;
  categoryStableId: string;
  amount: string;
  taxMode: TaxMode;
  manualTax: string;
};

type QuickDraft = {
  key: string;
  amount: string;
  categoryStableId: string;
  taxMode: 'EXEMPT' | 'HST13';
};

const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

const dollarsToCents = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

const centsToDollars = (value: number) => (value / 100).toFixed(2);
const makeKey = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function AccountingExpensesPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [documents, setDocuments] = useState<ExpenseDocument[]>([]);
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [receiptTotal, setReceiptTotal] = useState('');
  const [accountStableId, setAccountStableId] = useState('');
  const [memo, setMemo] = useState('');
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [splits, setSplits] = useState<SplitDraft[]>([]);
  const [quickRows, setQuickRows] = useState<QuickDraft[]>([]);
  const [showQuick, setShowQuick] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, accts, docs] = await Promise.all([
        apiFetch<Category[]>('/accounting/categories'),
        apiFetch<Account[]>('/accounting/accounts'),
        apiFetch<ExpenseDocument[]>('/accounting/expenses?status=CONFIRMED&limit=100'),
      ]);
      setCategories(cats);
      setAccounts(accts);
      setDocuments(docs);
      const parentStableIds = new Set(
        cats.map((category) => category.parentStableId).filter((value): value is string => Boolean(value)),
      );
      const firstExpense = cats.find(
        (category) => category.type === 'EXPENSE' && !parentStableIds.has(category.categoryStableId),
      );
      if (!splits.length && firstExpense) {
        setSplits([
          {
            key: makeKey(),
            categoryStableId: firstExpense.categoryStableId,
            amount: '',
            taxMode: 'EXEMPT',
            manualTax: '',
          },
        ]);
      }
      if (!accountStableId && accts[0]) setAccountStableId(accts[0].accountStableId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [accountStableId, splits.length]);

  useEffect(() => {
    void load();
  }, [load]);

  const expenseCategories = useMemo(() => {
    const parentStableIds = new Set(
      categories
        .map((category) => category.parentStableId)
        .filter((value): value is string => Boolean(value)),
    );
    return categories.filter(
      (category) =>
        category.type === 'EXPENSE' &&
        !parentStableIds.has(category.categoryStableId),
    );
  }, [categories]);

  const categoryParents = useMemo(
    () => new Map(categories.map((category) => [category.categoryStableId, category.name])),
    [categories],
  );

  const calculated = useMemo(() => {
    const rows = splits.map((split) => {
      const amountCents = dollarsToCents(split.amount);
      const taxCents =
        split.taxMode === 'HST13'
          ? Math.round(amountCents * 0.13)
          : split.taxMode === 'MANUAL'
            ? dollarsToCents(split.manualTax)
            : 0;
      return { ...split, amountCents, taxCents };
    });
    const subtotalCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
    const taxCents = rows.reduce((sum, row) => sum + row.taxCents, 0);
    const calculatedTotalCents = subtotalCents + taxCents;
    const receiptTotalCents = dollarsToCents(receiptTotal);
    return {
      rows,
      subtotalCents,
      taxCents,
      calculatedTotalCents,
      receiptTotalCents,
      differenceCents: receiptTotalCents - calculatedTotalCents,
    };
  }, [receiptTotal, splits]);

  function addSplit() {
    const defaultCategory = expenseCategories[0]?.categoryStableId ?? '';
    setSplits((current) => [
      ...current,
      {
        key: makeKey(),
        categoryStableId: current.at(-1)?.categoryStableId || defaultCategory,
        amount: '',
        taxMode: current.at(-1)?.taxMode ?? 'EXEMPT',
        manualTax: '',
      },
    ]);
  }

  function addQuickRow() {
    const defaultCategory = expenseCategories[0]?.categoryStableId ?? '';
    setQuickRows((current) => [
      ...current,
      {
        key: makeKey(),
        amount: '',
        categoryStableId: current.at(-1)?.categoryStableId || defaultCategory,
        taxMode: current.at(-1)?.taxMode ?? 'EXEMPT',
      },
    ]);
  }

  function aggregateQuickRows() {
    const grouped = new Map<string, { amountCents: number; taxCents: number }>();
    for (const row of quickRows) {
      const amountCents = dollarsToCents(row.amount);
      if (!amountCents || !row.categoryStableId) continue;
      const taxCents = row.taxMode === 'HST13' ? Math.round(amountCents * 0.13) : 0;
      const existing = grouped.get(row.categoryStableId) ?? { amountCents: 0, taxCents: 0 };
      existing.amountCents += amountCents;
      existing.taxCents += taxCents;
      grouped.set(row.categoryStableId, existing);
    }
    setSplits(
      Array.from(grouped.entries()).map(([categoryStableId, value]) => ({
        key: makeKey(),
        categoryStableId,
        amount: centsToDollars(value.amountCents),
        taxMode: value.taxCents > 0 ? 'MANUAL' : 'EXEMPT',
        manualTax: value.taxCents > 0 ? centsToDollars(value.taxCents) : '',
      })),
    );
    setShowQuick(false);
  }

  async function uploadReceipt(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiFetch<{ url: string }>('/accounting/files/receipts', {
        method: 'POST',
        body: formData,
      });
      setAttachmentUrls((current) => [...current, result.url]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!receiptTotal.trim()) {
      setError(isZh ? '请输入小票/账单总额。' : 'Enter the receipt total.');
      return;
    }
    if (calculated.differenceCents !== 0) {
      setError(
        isZh
          ? `尚未对平，差额 ${money(calculated.differenceCents)}。`
          : `The expense is not balanced. Difference: ${money(calculated.differenceCents)}.`,
      );
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/accounting/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occurredAt,
          totalCents: calculated.receiptTotalCents,
          accountStableId: accountStableId || null,
          attachmentUrls,
          memo: memo.trim() || null,
          splits: calculated.rows
            .filter((row) => row.amountCents > 0)
            .map((row) => ({
              categoryStableId: row.categoryStableId,
              amountCents: row.amountCents,
              taxCents: row.taxCents,
            })),
        }),
      });
      setReceiptTotal('');
      setMemo('');
      setAttachmentUrls([]);
      setQuickRows([]);
      setSplits((current) => [
        {
          key: makeKey(),
          categoryStableId: current[0]?.categoryStableId || expenseCategories[0]?.categoryStableId || '',
          amount: '',
          taxMode: 'EXEMPT',
          manualTax: '',
        },
      ]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">{isZh ? '加载中…' : 'Loading…'}</p>;

  if (!expenseCategories.length) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h1 className="text-xl font-semibold">{isZh ? '尚未初始化财务分类' : 'Accounting is not initialized'}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {isZh ? '请先到“设置与月结”完成一次初始化。' : 'Open Settings & close and initialize accounting first.'}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{isZh ? '支出' : 'Expenses'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '一张小票可以拆成多个费用类别；正式账目只保存类别汇总，不保存商品名。'
            : 'Split one receipt across categories. Product-level rows are only a calculator and are not posted to the ledger.'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{isZh ? '日期' : 'Date'}</span>
            <input className="w-full rounded border px-3 py-2" type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{isZh ? '小票 / 账单总额' : 'Receipt total'}</span>
            <div className="flex rounded border bg-white px-3 py-2"><span className="mr-1">$</span><input className="min-w-0 flex-1 outline-none" inputMode="decimal" value={receiptTotal} onChange={(event) => setReceiptTotal(event.target.value)} placeholder="0.00" /></div>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{isZh ? '付款账户' : 'Paid from'}</span>
            <select className="w-full rounded border px-3 py-2" value={accountStableId} onChange={(event) => setAccountStableId(event.target.value)}>
              <option value="">{isZh ? '暂不指定' : 'Not specified'}</option>
              {accounts.map((account) => <option key={account.accountStableId} value={account.accountStableId}>{account.name}</option>)}
            </select>
          </label>
        </div>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{isZh ? '费用分类' : 'Expense splits'}</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowQuick((value) => !value); if (!quickRows.length) addQuickRow(); }} className="rounded border px-3 py-1.5 text-sm">
                {isZh ? '快速归类计算器' : 'Quick classify calculator'}
              </button>
              <button type="button" onClick={addSplit} className="rounded border px-3 py-1.5 text-sm">+ {isZh ? '增加类别' : 'Add category'}</button>
            </div>
          </div>

          {showQuick ? (
            <div className="mb-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-slate-600">
                {isZh ? '按小票逐行输入金额即可；类别和税默认沿用上一行。点击汇总后，商品级行不会保存。' : 'Enter receipt line amounts. Category and tax carry forward. Item rows are discarded after aggregation.'}
              </p>
              {quickRows.map((row) => (
                <div key={row.key} className="grid gap-2 md:grid-cols-[140px_1fr_130px_80px]">
                  <input className="rounded border bg-white px-3 py-2 text-sm" inputMode="decimal" placeholder="0.00" value={row.amount} onChange={(event) => setQuickRows((current) => current.map((item) => item.key === row.key ? { ...item, amount: event.target.value } : item))} />
                  <select className="rounded border bg-white px-3 py-2 text-sm" value={row.categoryStableId} onChange={(event) => setQuickRows((current) => current.map((item) => item.key === row.key ? { ...item, categoryStableId: event.target.value } : item))}>
                    {expenseCategories.map((category) => <option key={category.categoryStableId} value={category.categoryStableId}>{categoryParents.get(category.parentStableId ?? '') ? `${categoryParents.get(category.parentStableId ?? '')} › ` : ''}{category.name}</option>)}
                  </select>
                  <select className="rounded border bg-white px-3 py-2 text-sm" value={row.taxMode} onChange={(event) => setQuickRows((current) => current.map((item) => item.key === row.key ? { ...item, taxMode: event.target.value as QuickDraft['taxMode'] } : item))}>
                    <option value="EXEMPT">{isZh ? '免税' : 'Tax exempt'}</option>
                    <option value="HST13">HST 13%</option>
                  </select>
                  <button type="button" className="text-sm text-red-600" onClick={() => setQuickRows((current) => current.filter((item) => item.key !== row.key))}>{isZh ? '删除' : 'Remove'}</button>
                </div>
              ))}
              <div className="flex gap-2">
                <button type="button" onClick={addQuickRow} className="rounded border bg-white px-3 py-1.5 text-sm">+ {isZh ? '下一行' : 'Next row'}</button>
                <button type="button" onClick={aggregateQuickRows} className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">{isZh ? '汇总到费用分类' : 'Aggregate categories'}</button>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {splits.map((split) => (
              <div key={split.key} className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[1.5fr_140px_140px_120px_70px] md:items-end">
                <label className="text-sm"><span className="mb-1 block text-slate-500">{isZh ? '类别' : 'Category'}</span><select className="w-full rounded border bg-white px-3 py-2" value={split.categoryStableId} onChange={(event) => setSplits((current) => current.map((item) => item.key === split.key ? { ...item, categoryStableId: event.target.value } : item))}>{expenseCategories.map((category) => <option key={category.categoryStableId} value={category.categoryStableId}>{categoryParents.get(category.parentStableId ?? '') ? `${categoryParents.get(category.parentStableId ?? '')} › ` : ''}{category.name}</option>)}</select></label>
                <label className="text-sm"><span className="mb-1 block text-slate-500">{isZh ? '税前金额' : 'Before tax'}</span><input className="w-full rounded border bg-white px-3 py-2" inputMode="decimal" value={split.amount} onChange={(event) => setSplits((current) => current.map((item) => item.key === split.key ? { ...item, amount: event.target.value } : item))} placeholder="0.00" /></label>
                <label className="text-sm"><span className="mb-1 block text-slate-500">{isZh ? '税' : 'Tax'}</span><select className="w-full rounded border bg-white px-3 py-2" value={split.taxMode} onChange={(event) => setSplits((current) => current.map((item) => item.key === split.key ? { ...item, taxMode: event.target.value as TaxMode } : item))}><option value="EXEMPT">{isZh ? '免税' : 'Exempt'}</option><option value="HST13">HST 13%</option><option value="MANUAL">{isZh ? '手动税额' : 'Manual tax'}</option></select></label>
                {split.taxMode === 'MANUAL' ? <label className="text-sm"><span className="mb-1 block text-slate-500">HST</span><input className="w-full rounded border bg-white px-3 py-2" inputMode="decimal" value={split.manualTax} onChange={(event) => setSplits((current) => current.map((item) => item.key === split.key ? { ...item, manualTax: event.target.value } : item))} placeholder="0.00" /></label> : <div className="pb-2 text-sm text-slate-600">HST {money(calculated.rows.find((row) => row.key === split.key)?.taxCents ?? 0)}</div>}
                <button type="button" className="pb-2 text-sm text-red-600" disabled={splits.length <= 1} onClick={() => setSplits((current) => current.filter((item) => item.key !== split.key))}>{isZh ? '删除' : 'Remove'}</button>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium">{isZh ? '凭证' : 'Receipt image'}</p>
            <label className="mt-2 inline-flex cursor-pointer rounded border px-3 py-2 text-sm">
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadReceipt(file); event.currentTarget.value = ''; }} />
              {uploading ? (isZh ? '上传中…' : 'Uploading…') : (isZh ? '上传纸质小票照片' : 'Upload receipt photo')}
            </label>
            {attachmentUrls.map((url) => <p key={url} className="mt-1 truncate text-xs text-blue-600">{url}</p>)}
          </div>
          <label className="text-sm"><span className="mb-1 block text-slate-500">{isZh ? '备注' : 'Memo'}</span><textarea className="min-h-24 w-full rounded border px-3 py-2" value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
        </div>

        <div className="rounded-xl bg-slate-900 p-4 text-white">
          <div className="grid gap-2 text-sm sm:grid-cols-4">
            <div><p className="text-slate-400">{isZh ? '税前合计' : 'Subtotal'}</p><p className="text-lg font-semibold">{money(calculated.subtotalCents)}</p></div>
            <div><p className="text-slate-400">HST</p><p className="text-lg font-semibold">{money(calculated.taxCents)}</p></div>
            <div><p className="text-slate-400">{isZh ? '分类合计' : 'Calculated total'}</p><p className="text-lg font-semibold">{money(calculated.calculatedTotalCents)}</p></div>
            <div><p className="text-slate-400">{isZh ? '差额' : 'Difference'}</p><p className={`text-lg font-semibold ${calculated.differenceCents === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{money(calculated.differenceCents)}</p></div>
          </div>
          <p className="mt-2 text-xs text-slate-300">{calculated.differenceCents === 0 ? (isZh ? '✓ 已与小票总额对平' : '✓ Balanced to receipt total') : (isZh ? '保存前必须对平。' : 'Balance the receipt before saving.')}</p>
        </div>

        {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button type="submit" disabled={submitting || uploading || calculated.differenceCents !== 0 || calculated.receiptTotalCents <= 0} className="rounded bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{submitting ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存支出' : 'Save expense')}</button>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{isZh ? '最近支出' : 'Recent expenses'}</h2>
        <div className="mt-3 divide-y text-sm">
          {documents.length ? documents.map((document) => (
            <div key={document.documentStableId} className="grid gap-2 py-3 md:grid-cols-[130px_110px_1fr_140px]">
              <span>{document.occurredAt ? new Date(document.occurredAt).toLocaleDateString() : '-'}</span>
              <strong>{money(document.totalCents)}</strong>
              <div className="text-slate-600">{document.splits.map((split) => `${split.categoryName} ${money(split.amountCents + split.taxCents)}`).join(' / ') || document.memo || '-'}</div>
              <div className="text-right">{document.attachmentUrls[0] ? <a className="text-blue-600 hover:underline" href={document.attachmentUrls[0]} target="_blank" rel="noreferrer">{isZh ? '查看凭证' : 'Receipt'}</a> : '-'}</div>
            </div>
          )) : <p className="py-4 text-slate-500">{isZh ? '暂无支出。' : 'No expenses yet.'}</p>}
        </div>
      </section>
    </div>
  );
}
