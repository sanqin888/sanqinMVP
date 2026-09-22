'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AccountingAccount, AccountingCategory } from '../contracts/chart';
import {
  ExpenseSplitEditor,
  type ExpenseSplitDraft,
} from './expense-split-editor';

type Props = {
  locale: string;
  isZh: boolean;
  categories: AccountingCategory[];
  accounts: AccountingAccount[];
  hidden: boolean;
  onSaved: () => Promise<void> | void;
};

const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

const dollarsToCents = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

const makeKey = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const defaultExpenseDate = () => new Date().toISOString().slice(0, 10);

export function ExpenseCreateForm({
  locale,
  isZh,
  categories,
  accounts,
  hidden,
  onSaved,
}: Props) {
  const [occurredAt, setOccurredAt] = useState(defaultExpenseDate);
  const [receiptTotal, setReceiptTotal] = useState('');
  const [memo, setMemo] = useState('');
  const [splits, setSplits] = useState<ExpenseSplitDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    () =>
      new Map(
        categories.map((category) => [
          category.categoryStableId,
          category.name,
        ]),
      ),
    [categories],
  );

  useEffect(() => {
    if (!splits.length && expenseCategories[0]) {
      setSplits([
        {
          key: makeKey(),
          categoryStableId: expenseCategories[0].categoryStableId,
          amount: '',
          taxMode: 'EXEMPT',
          manualTax: '',
          paidFromAccountStableId: '',
        },
      ]);
    }
  }, [expenseCategories, splits.length]);

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
      taxCentsByKey: new Map(
        rows.map((row) => [row.key, row.taxCents] as const),
      ),
    };
  }, [receiptTotal, splits]);

  function addSplit() {
    const defaultCategory = expenseCategories[0]?.categoryStableId ?? '';
    setSplits((current) => [
      ...current,
      {
        key: makeKey(),
        categoryStableId:
          current.at(-1)?.categoryStableId || defaultCategory,
        amount: '',
        taxMode: current.at(-1)?.taxMode ?? 'EXEMPT',
        manualTax: '',
        paidFromAccountStableId:
          current.at(-1)?.paidFromAccountStableId ?? '',
      },
    ]);
  }

  function resetForm() {
    setOccurredAt(defaultExpenseDate());
    setReceiptTotal('');
    setMemo('');
    setSplits([
      {
        key: makeKey(),
        categoryStableId: expenseCategories[0]?.categoryStableId ?? '',
        amount: '',
        taxMode: 'EXEMPT',
        manualTax: '',
        paidFromAccountStableId: '',
      },
    ]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!receiptTotal.trim()) {
      setError(
        isZh ? '请输入小票/账单总额。' : 'Enter the receipt total.',
      );
      return;
    }
    if (calculated.differenceCents !== 0) {
      setError(
        isZh
          ? `尚未对平，差额 ${money(calculated.differenceCents)}。`
          : `The expense is not balanced. Difference: ${money(
              calculated.differenceCents,
            )}.`,
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
          attachmentUrls: [],
          memo: memo.trim() || null,
          splits: calculated.rows
            .filter((row) => row.amountCents > 0)
            .map((row) => ({
              categoryStableId: row.categoryStableId,
              amountCents: row.amountCents,
              taxCents: row.taxCents,
              paidFromAccountStableId:
                row.paidFromAccountStableId || null,
            })),
        }),
      });
      resetForm();
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      id={hidden ? undefined : 'expense-editor'}
      onSubmit={onSubmit}
      hidden={hidden}
      className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-semibold">
          {isZh ? '新增/编辑支出' : 'Add / edit expense'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '当前为新增模式：仅用于没有收据、发票或邮件凭证的手工补录；所有记账金额均为 CAD。'
            : 'Create mode is for manual entries without a receipt, invoice, or email artifact. All booked amounts are CAD.'}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? '日期' : 'Date'}
          </span>
          <input
            className="w-full rounded border px-3 py-2"
            type="date"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? 'CAD 记账总额' : 'CAD booking total'}
          </span>
          <div className="flex rounded border bg-white px-3 py-2">
            <span className="mr-1">CAD $</span>
            <input
              className="min-w-0 flex-1 outline-none"
              inputMode="decimal"
              value={receiptTotal}
              onChange={(event) => setReceiptTotal(event.target.value)}
              placeholder="0.00"
            />
          </div>
        </label>
      </div>

      <ExpenseSplitEditor
        isZh={isZh}
        splits={splits}
        expenseCategories={expenseCategories}
        accounts={accounts}
        categoryParents={categoryParents}
        taxCentsByKey={calculated.taxCentsByKey}
        onAdd={addSplit}
        onChange={setSplits}
      />

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h3 className="font-semibold">
          {isZh ? '凭证文件' : 'Evidence files'}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '有凭证的账单请从财务收件箱上传并审核；这里仅新增无凭证支出。'
            : 'Upload and review expenses with evidence in Accounting Inbox. This mode creates no-evidence expenses only.'}
        </p>
        <Link
          className="mt-2 inline-flex rounded border bg-white px-3 py-2 text-sm text-blue-600"
          href={`/${locale}/accounting/inbox`}
        >
          {isZh ? '打开财务收件箱' : 'Open Accounting Inbox'}
        </Link>
      </section>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-500">
          {isZh ? '备注' : 'Memo'}
        </span>
        <textarea
          className="min-h-24 w-full rounded border px-3 py-2"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
        />
      </label>

      <div className="rounded-xl bg-slate-900 p-4 text-white">
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          <div>
            <p className="text-slate-400">
              {isZh ? '税前合计' : 'Subtotal'}
            </p>
            <p className="text-lg font-semibold">
              {money(calculated.subtotalCents)}
            </p>
          </div>
          <div>
            <p className="text-slate-400">HST</p>
            <p className="text-lg font-semibold">
              {money(calculated.taxCents)}
            </p>
          </div>
          <div>
            <p className="text-slate-400">
              {isZh ? '分类合计' : 'Calculated total'}
            </p>
            <p className="text-lg font-semibold">
              {money(calculated.calculatedTotalCents)}
            </p>
          </div>
          <div>
            <p className="text-slate-400">
              {isZh ? '差额' : 'Difference'}
            </p>
            <p
              className={`text-lg font-semibold ${
                calculated.differenceCents === 0
                  ? 'text-emerald-300'
                  : 'text-amber-300'
              }`}
            >
              {money(calculated.differenceCents)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-300">
          {calculated.differenceCents === 0
            ? isZh
              ? '✓ 已与小票总额对平'
              : '✓ Balanced to receipt total'
            : isZh
              ? '保存前必须对平。'
              : 'Balance the receipt before saving.'}
        </p>
      </div>

      {error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={
          submitting ||
          calculated.differenceCents !== 0 ||
          calculated.receiptTotalCents <= 0
        }
        className="rounded bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting
          ? isZh
            ? '保存中…'
            : 'Saving…'
          : isZh
            ? '保存支出'
            : 'Save expense'}
      </button>
    </form>
  );
}
