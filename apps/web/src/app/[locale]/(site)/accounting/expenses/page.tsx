'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import {
  ExpensePaymentAllocationsEditor,
  expensePaymentAllocationErrorMessage,
  makeExpensePaymentAllocationDraft,
  prepareExpensePaymentAllocations,
  type ExpensePaymentAllocationDraft,
} from '../expense-payment-allocations';

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
  paymentAllocations: Array<{
    paymentAllocationStableId: string;
    accountStableId: string;
    accountName: string;
    amountCents: number;
    sortOrder: number;
  }>;
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

const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

const dollarsToCents = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

const makeKey = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function AccountingExpensesPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [documents, setDocuments] = useState<ExpenseDocument[]>([]);
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [receiptTotal, setReceiptTotal] = useState('');
  const [paymentAllocations, setPaymentAllocations] = useState<
    ExpensePaymentAllocationDraft[]
  >(() => [makeExpensePaymentAllocationDraft()]);
  const [memo, setMemo] = useState('');
  const [splits, setSplits] = useState<SplitDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [splits.length]);

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
    const preparedPaymentAllocations = prepareExpensePaymentAllocations(
      paymentAllocations,
      calculated.receiptTotalCents,
    );
    if (preparedPaymentAllocations.error) {
      setError(
        expensePaymentAllocationErrorMessage(
          preparedPaymentAllocations.error,
          isZh,
        ),
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
          paymentAllocations: preparedPaymentAllocations.paymentAllocations,
          attachmentUrls: [],
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
      setPaymentAllocations([makeExpensePaymentAllocationDraft()]);
      setMemo('');
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
            ? '这里查看已经确认的费用；有凭证的账单请在财务收件箱完成识别、归类和确认。'
            : 'Review confirmed expenses here. Use Accounting Inbox to recognize, classify, and confirm expenses that have supporting evidence.'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">
            {isZh ? '无凭证手工新增支出' : 'Add expense without evidence'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? '仅用于没有收据、发票或邮件凭证的手工补录；所有记账金额均为 CAD。'
              : 'Use only for manual entries without a receipt, invoice, or email artifact. All booked amounts are CAD.'}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{isZh ? '日期' : 'Date'}</span>
            <input className="w-full rounded border px-3 py-2" type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{isZh ? 'CAD 记账总额' : 'CAD booking total'}</span>
            <div className="flex rounded border bg-white px-3 py-2"><span className="mr-1">CAD $</span><input className="min-w-0 flex-1 outline-none" inputMode="decimal" value={receiptTotal} onChange={(event) => setReceiptTotal(event.target.value)} placeholder="0.00" /></div>
          </label>
        </div>

        <ExpensePaymentAllocationsEditor
          accounts={accounts}
          totalCents={calculated.receiptTotalCents}
          allocations={paymentAllocations}
          onChange={setPaymentAllocations}
          isZh={isZh}
        />

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{isZh ? '费用分类' : 'Expense splits'}</h2>
            <button type="button" onClick={addSplit} className="rounded border px-3 py-1.5 text-sm">
              + {isZh ? '增加类别' : 'Add category'}
            </button>
          </div>

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
            <p className="text-sm font-medium">{isZh ? '凭证文件' : 'Evidence files'}</p>
            <p className="mt-1 text-sm text-slate-500">
              {isZh
                ? '文件上传已统一到财务收件箱；在那里上传 PDF、CSV 或图片，再审核是否作为费用入账。'
                : 'File intake now goes through Accounting Inbox. Upload PDF, CSV, or images there, then review whether the evidence should become an expense.'}
            </p>
            <Link className="mt-2 inline-flex rounded border px-3 py-2 text-sm text-blue-600" href={`/${params.locale}/accounting/inbox`}>
              {isZh ? '打开财务收件箱' : 'Open Accounting Inbox'}
            </Link>
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
        <button type="submit" disabled={submitting || calculated.differenceCents !== 0 || calculated.receiptTotalCents <= 0} className="rounded bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{submitting ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存支出' : 'Save expense')}</button>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{isZh ? '最近支出' : 'Recent expenses'}</h2>
        <div className="mt-3 divide-y text-sm">
          {documents.length ? documents.map((document) => (
            <div key={document.documentStableId} className="grid gap-2 py-3 md:grid-cols-[130px_110px_1fr_140px]">
              <span>{document.occurredAt ? new Date(document.occurredAt).toLocaleDateString() : '-'}</span>
              <strong>{money(document.totalCents)}</strong>
              <div className="text-slate-600">
                <div>{document.splits.map((split) => `${split.categoryName} ${money(split.amountCents + split.taxCents)}`).join(' / ') || document.memo || '-'}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {isZh ? '付款：' : 'Paid from: '}
                  {document.paymentAllocations.length
                    ? document.paymentAllocations
                        .map((allocation) => `${allocation.accountName} ${money(allocation.amountCents)}`)
                        .join(' / ')
                    : isZh
                      ? '暂未指定'
                      : 'Not specified'}
                </div>
              </div>
              <div className="text-right">{document.attachmentUrls[0] ? <a className="text-blue-600 hover:underline" href={document.attachmentUrls[0]} target="_blank" rel="noreferrer">{isZh ? '查看凭证' : 'Receipt'}</a> : '-'}</div>
            </div>
          )) : <p className="py-4 text-slate-500">{isZh ? '暂无支出。' : 'No expenses yet.'}</p>}
        </div>
      </section>
    </div>
  );
}
