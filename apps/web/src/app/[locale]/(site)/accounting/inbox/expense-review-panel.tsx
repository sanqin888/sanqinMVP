'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import {
  type AccountingAccount,
  type AccountingCategory,
  type AccountingExpenseReviewRow,
  type AccountingInboxItem,
  latestParse,
  makeReviewKey,
  money,
  toCents,
  toDollars,
} from './inbox-model';

type Props = {
  item: AccountingInboxItem;
  categories: AccountingCategory[];
  accounts: AccountingAccount[];
  isZh: boolean;
  onClose: () => void;
  onConfirmed: () => Promise<void>;
};

export function AccountingInboxExpenseReviewPanel({
  item,
  categories,
  accounts,
  isZh,
  onClose,
  onConfirmed,
}: Props) {
  const [date, setDate] = useState('');
  const [total, setTotal] = useState('');
  const [accountStableId, setAccountStableId] = useState('');
  const [memo, setMemo] = useState('');
  const [rows, setRows] = useState<AccountingExpenseReviewRow[]>([]);
  const [saving, setSaving] = useState(false);
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
  const categoryNames = useMemo(
    () =>
      new Map(
        categories.map((category) => [category.categoryStableId, category.name]),
      ),
    [categories],
  );

  useEffect(() => {
    const extraction = latestParse(item);
    const suggested = extraction.suggestedCategoryStableId;
    const defaultCategory =
      (suggested &&
      expenseCategories.some(
        (category) => category.categoryStableId === suggested,
      )
        ? suggested
        : null) ??
      expenseCategories[0]?.categoryStableId ??
      '';
    const subtotalCents =
      extraction.subtotalCents ?? extraction.totalCents ?? 0;
    const taxCents = extraction.taxCents ?? 0;
    setDate(extraction.date ?? new Date().toISOString().slice(0, 10));
    setTotal(toDollars(extraction.totalCents ?? subtotalCents + taxCents));
    setAccountStableId(accounts[0]?.accountStableId ?? '');
    setMemo('');
    setRows([
      {
        key: makeReviewKey(),
        categoryStableId: defaultCategory,
        amount: toDollars(subtotalCents),
        tax: toDollars(taxCents),
      },
    ]);
    setError(null);
  }, [accounts, expenseCategories, item]);

  const calculated = useMemo(() => {
    const subtotalCents = rows.reduce(
      (sum, row) => sum + toCents(row.amount),
      0,
    );
    const taxCents = rows.reduce((sum, row) => sum + toCents(row.tax), 0);
    const totalCents = toCents(total);
    return {
      subtotalCents,
      taxCents,
      totalCents,
      differenceCents: totalCents - subtotalCents - taxCents,
    };
  }, [rows, total]);

  async function confirmExpense() {
    if (calculated.totalCents <= 0 || calculated.differenceCents !== 0) {
      setError(
        isZh
          ? `账单未对平，当前差额 ${money(calculated.differenceCents)}。`
          : `The expense is not balanced. Difference: ${money(calculated.differenceCents)}.`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(
        `/accounting/inbox/${item.inboxItemStableId}/expense/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            occurredAt: date,
            totalCents: calculated.totalCents,
            accountStableId: accountStableId || null,
            attachmentUrls: [],
            memo: memo.trim() || null,
            splits: rows
              .filter(
                (row) => toCents(row.amount) > 0 || toCents(row.tax) > 0,
              )
              .map((row) => ({
                categoryStableId: row.categoryStableId,
                amountCents: toCents(row.amount),
                taxCents: toCents(row.tax),
              })),
          }),
        },
      );
      await onConfirmed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  const extraction = latestParse(item);

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {isZh ? '按费用处理' : 'Review as expense'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {item.artifact.emailSubject ||
              item.artifact.originalFilename ||
              item.inboxItemStableId}
          </p>
        </div>
        <button className="text-sm text-slate-600" onClick={onClose}>
          {isZh ? '关闭' : 'Close'}
        </button>
      </div>
      <p className="mt-3 rounded bg-white px-3 py-2 text-xs text-amber-800">
        {isZh
          ? '只有确认这是普通费用凭证时才继续。Clover / Uber Eats / Fantuan 对账单、Closeout 或平台财务文件请留在收件箱，等待平台财务解析。'
          : 'Continue only for ordinary expense evidence. Leave Clover / Uber Eats / Fantuan statements, closeouts, and platform financial files in Inbox for provider parsing.'}
      </p>
      {extraction.extractedText || item.artifact.bodyText ? (
        <details className="mt-4 rounded-lg border bg-white p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {isZh ? '查看识别原文' : 'View extracted text'}
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-xs text-slate-600">
            {extraction.extractedText ?? item.artifact.bodyText}
          </pre>
        </details>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">{isZh ? '日期' : 'Date'}</span>
          <input
            className="w-full rounded border bg-white px-3 py-2"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? '账单总额' : 'Bill total'}
          </span>
          <div className="flex rounded border bg-white px-3 py-2">
            <span>$</span>
            <input
              className="ml-1 min-w-0 flex-1 outline-none"
              value={total}
              inputMode="decimal"
              onChange={(event) => setTotal(event.target.value)}
            />
          </div>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? '付款账户' : 'Paid from'}
          </span>
          <select
            className="w-full rounded border bg-white px-3 py-2"
            value={accountStableId}
            onChange={(event) => setAccountStableId(event.target.value)}
          >
            <option value="">{isZh ? '暂不指定' : 'Not specified'}</option>
            {accounts.map((account) => (
              <option key={account.accountStableId} value={account.accountStableId}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid gap-2 md:grid-cols-[1.6fr_140px_140px_70px] md:items-end"
          >
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">
                {isZh ? '类别' : 'Category'}
              </span>
              <select
                className="w-full rounded border bg-white px-3 py-2"
                value={row.categoryStableId}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((entry) =>
                      entry.key === row.key
                        ? { ...entry, categoryStableId: event.target.value }
                        : entry,
                    ),
                  )
                }
              >
                {expenseCategories.map((category) => (
                  <option
                    key={category.categoryStableId}
                    value={category.categoryStableId}
                  >
                    {categoryNames.get(category.parentStableId ?? '')
                      ? `${categoryNames.get(category.parentStableId ?? '')} › `
                      : ''}
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">
                {isZh ? '税前金额' : 'Before tax'}
              </span>
              <input
                className="w-full rounded border bg-white px-3 py-2"
                value={row.amount}
                inputMode="decimal"
                onChange={(event) =>
                  setRows((current) =>
                    current.map((entry) =>
                      entry.key === row.key
                        ? { ...entry, amount: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">HST</span>
              <input
                className="w-full rounded border bg-white px-3 py-2"
                value={row.tax}
                inputMode="decimal"
                onChange={(event) =>
                  setRows((current) =>
                    current.map((entry) =>
                      entry.key === row.key
                        ? { ...entry, tax: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              disabled={rows.length <= 1}
              className="pb-2 text-sm text-red-600 disabled:text-slate-300"
              onClick={() =>
                setRows((current) =>
                  current.filter((entry) => entry.key !== row.key),
                )
              }
            >
              {isZh ? '删除' : 'Remove'}
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 rounded border bg-white px-3 py-1.5 text-sm"
        onClick={() =>
          setRows((current) => [
            ...current,
            {
              key: makeReviewKey(),
              categoryStableId:
                current.at(-1)?.categoryStableId ||
                expenseCategories[0]?.categoryStableId ||
                '',
              amount: '',
              tax: '',
            },
          ])
        }
      >
        + {isZh ? '增加类别' : 'Add category'}
      </button>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-slate-500">{isZh ? '备注' : 'Memo'}</span>
        <textarea
          className="min-h-20 w-full rounded border bg-white px-3 py-2"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
        />
      </label>
      <div className="mt-4 grid gap-3 rounded-lg bg-white p-3 text-sm sm:grid-cols-4">
        <div>
          <span className="text-slate-500">{isZh ? '税前' : 'Subtotal'}</span>
          <strong className="ml-2">{money(calculated.subtotalCents)}</strong>
        </div>
        <div>
          <span className="text-slate-500">HST</span>
          <strong className="ml-2">{money(calculated.taxCents)}</strong>
        </div>
        <div>
          <span className="text-slate-500">{isZh ? '总额' : 'Total'}</span>
          <strong className="ml-2">{money(calculated.totalCents)}</strong>
        </div>
        <div>
          <span className="text-slate-500">{isZh ? '差额' : 'Difference'}</span>
          <strong
            className={`ml-2 ${calculated.differenceCents === 0 ? 'text-emerald-600' : 'text-amber-600'}`}
          >
            {money(calculated.differenceCents)}
          </strong>
        </div>
      </div>
      {error ? (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => void confirmExpense()}
          disabled={
            saving || calculated.differenceCents !== 0 || calculated.totalCents <= 0
          }
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving
            ? isZh
              ? '入账中…'
              : 'Posting…'
            : isZh
              ? '确认作为费用入账'
              : 'Confirm as expense'}
        </button>
        {item.artifact.storedUrl ? (
          <a
            className="rounded border bg-white px-4 py-2 text-sm text-blue-600"
            href={item.artifact.storedUrl}
            target="_blank"
            rel="noreferrer"
          >
            {isZh ? '打开原始文件' : 'Open original file'}
          </a>
        ) : null}
      </div>
    </section>
  );
}
