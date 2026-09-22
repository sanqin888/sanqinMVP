'use client';

import { useState } from 'react';
import { AccountingEvidenceViewer } from '../accounting-evidence-viewer';
import type { AccountingAccount } from '../contracts/chart';
import type { AccountingExpenseDocument } from '../contracts/expenses';

export const UNASSIGNED_PAYMENT_FILTER = '__UNASSIGNED__';

export type ExpenseRecordFilters = {
  from: string;
  to: string;
  minAmount: string;
  paymentFilter: string;
};

export const EMPTY_EXPENSE_RECORD_FILTERS: ExpenseRecordFilters = {
  from: '',
  to: '',
  minAmount: '',
  paymentFilter: '',
};

type Props = {
  documents: AccountingExpenseDocument[];
  total: number;
  limit: number;
  offset: number;
  accounts: AccountingAccount[];
  loading: boolean;
  isZh: boolean;
  onApplyFilters: (filters: ExpenseRecordFilters) => void;
  onPageChange: (offset: number) => void;
  onPageSizeChange: (limit: number) => void;
  onCompletePayment: (document: AccountingExpenseDocument) => void;
};

const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

export function ExpenseRecordsPanel({
  documents,
  total,
  limit,
  offset,
  accounts,
  loading,
  isZh,
  onApplyFilters,
  onPageChange,
  onPageSizeChange,
  onCompletePayment,
}: Props) {
  const [filters, setFilters] = useState<ExpenseRecordFilters>(
    EMPTY_EXPENSE_RECORD_FILTERS,
  );
  const pageStart = documents.length ? offset + 1 : 0;
  const pageEnd = documents.length
    ? Math.min(offset + documents.length, total)
    : 0;
  const hasPrevious = offset > 0;
  const hasNext = offset + limit < total;

  function clearFilters() {
    setFilters(EMPTY_EXPENSE_RECORD_FILTERS);
    onApplyFilters(EMPTY_EXPENSE_RECORD_FILTERS);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {isZh ? '支出记录' : 'Expense records'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? '筛选会作用于全部历史支出，再按每页条数分页显示。'
              : 'Filters apply to all expense history before pagination.'}
          </p>
        </div>
        <label className="text-sm">
          <span className="mr-2 text-slate-500">
            {isZh ? '每页' : 'Per page'}
          </span>
          <select
            className="rounded border bg-white px-2 py-1.5"
            value={limit}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[10, 25, 50].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form
        className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          onApplyFilters(filters);
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? '起始日期' : 'From'}
          </span>
          <input
            className="w-full rounded border bg-white px-3 py-2"
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters((current) => ({ ...current, from: event.target.value }))
            }
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? '结束日期' : 'To'}
          </span>
          <input
            className="w-full rounded border bg-white px-3 py-2"
            type="date"
            value={filters.to}
            onChange={(event) =>
              setFilters((current) => ({ ...current, to: event.target.value }))
            }
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? '最低金额 ≥' : 'Minimum amount ≥'}
          </span>
          <div className="flex rounded border bg-white px-3 py-2">
            <span className="mr-1">$</span>
            <input
              className="min-w-0 flex-1 outline-none"
              inputMode="decimal"
              min="0"
              value={filters.minAmount}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  minAmount: event.target.value,
                }))
              }
              placeholder="0.00"
            />
          </div>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? '付款账户' : 'Payment account'}
          </span>
          <select
            className="w-full rounded border bg-white px-3 py-2"
            value={filters.paymentFilter}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                paymentFilter: event.target.value,
              }))
            }
          >
            <option value="">{isZh ? '全部' : 'All'}</option>
            <option value={UNASSIGNED_PAYMENT_FILTER}>
              {isZh ? '未指定付款账户' : 'Unassigned'}
            </option>
            {accounts
              .filter((account) => account.currency === 'CAD')
              .map((account) => (
                <option
                  key={account.accountStableId}
                  value={account.accountStableId}
                >
                  {account.name}
                </option>
              ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {isZh ? '应用筛选' : 'Apply'}
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            onClick={clearFilters}
          >
            {isZh ? '清除' : 'Clear'}
          </button>
        </div>
      </form>

      <div className="mt-4 divide-y text-sm">
        {loading ? (
          <p className="py-4 text-slate-500">
            {isZh ? '加载支出记录…' : 'Loading expense records…'}
          </p>
        ) : documents.length ? (
          documents.map((document) => (
            <div
              key={document.documentStableId}
              className="grid gap-3 py-4 md:grid-cols-[120px_105px_1fr_auto]"
            >
              <span>
                {document.occurredAt
                  ? new Date(document.occurredAt).toLocaleDateString()
                  : '-'}
              </span>
              <strong>{money(document.totalCents)}</strong>
              <div className="text-slate-600">
                <div>
                  {document.splits
                    .map(
                      (split) =>
                        `${split.categoryName} ${money(
                          split.amountCents + split.taxCents,
                        )}`,
                    )
                    .join(' / ') ||
                    document.memo ||
                    '-'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {isZh ? '付款：' : 'Paid from: '}
                  {document.paymentAllocations.length
                    ? document.paymentAllocations
                        .map(
                          (allocation) =>
                            `${allocation.accountName} ${money(
                              allocation.amountCents,
                            )}`,
                        )
                        .join(' / ')
                    : null}
                </div>
                {!document.paymentAllocations.length ? (
                  <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {isZh
                      ? '付款账户未指定'
                      : 'Payment account not specified'}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-start justify-end gap-2">
                {document.sourceEvidence ? (
                  <AccountingEvidenceViewer
                    evidence={{
                      artifactStableId: document.sourceEvidence.artifactStableId,
                      filename: document.sourceEvidence.originalFilename,
                      kind: document.sourceEvidence.kind,
                    }}
                    isZh={isZh}
                    label={isZh ? '查看凭证' : 'View receipt'}
                    className="rounded border px-3 py-1.5 text-blue-600"
                  />
                ) : document.attachmentUrls[0] ? (
                  <a
                    className="rounded border px-3 py-1.5 text-blue-600"
                    href={document.attachmentUrls[0]}
                    download
                  >
                    {isZh ? '下载凭证' : 'Download receipt'}
                  </a>
                ) : null}
                {!document.paymentAllocations.length ? (
                  <button
                    type="button"
                    className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 font-medium text-amber-800"
                    onClick={() => onCompletePayment(document)}
                  >
                    {isZh ? '补充付款信息' : 'Complete payment info'}
                  </button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <p className="py-4 text-slate-500">
            {isZh ? '没有符合条件的支出。' : 'No matching expenses.'}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
        <span className="text-slate-500">
          {isZh
            ? `共 ${total} 条 · 当前 ${pageStart}–${pageEnd}`
            : `${total} total · showing ${pageStart}–${pageEnd}`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!hasPrevious || loading}
            onClick={() => onPageChange(Math.max(offset - limit, 0))}
          >
            {isZh ? '上一页' : 'Previous'}
          </button>
          <button
            type="button"
            className="rounded border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!hasNext || loading}
            onClick={() => onPageChange(offset + limit)}
          >
            {isZh ? '下一页' : 'Next'}
          </button>
        </div>
      </div>
    </section>
  );
}
