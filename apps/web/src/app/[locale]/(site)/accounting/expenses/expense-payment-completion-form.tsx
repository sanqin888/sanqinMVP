'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { AccountingEvidenceViewer } from '../accounting-evidence-viewer';
import type { AccountingAccount } from '../contracts/chart';
import type { AccountingExpenseDocument } from '../contracts/expenses';
import {
  ExpensePaymentAllocationsEditor,
  expensePaymentAllocationErrorMessage,
  makeExpensePaymentAllocationDraft,
  prepareExpensePaymentAllocations,
  type ExpensePaymentAllocationDraft,
} from '../expense-payment-allocations';

type Props = {
  isZh: boolean;
  accounts: AccountingAccount[];
  document: AccountingExpenseDocument;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
};

const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

export function ExpensePaymentCompletionForm({
  isZh,
  accounts,
  document,
  onSaved,
  onCancel,
}: Props) {
  const [paymentAllocations, setPaymentAllocations] = useState<
    ExpensePaymentAllocationDraft[]
  >(() => [makeExpensePaymentAllocationDraft()]);
  const [splitFunding, setSplitFunding] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPaymentAllocations([makeExpensePaymentAllocationDraft()]);
    setSplitFunding(
      Object.fromEntries(
        document.splits.map((split) => [
          split.splitStableId,
          split.paidFromAccountStableId ?? '',
        ]),
      ),
    );
    setError(null);
  }, [document.documentStableId, document.splits]);

  const isV2 = document.fundingAttributionVersion === 2;

  const prepared = useMemo(
    () =>
      prepareExpensePaymentAllocations(
        paymentAllocations,
        document.totalCents ?? 0,
      ),
    [document.totalCents, paymentAllocations],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (isV2) {
      const missingFunding = document.splits.some(
        (split) => !splitFunding[split.splitStableId]?.trim(),
      );
      if (missingFunding) {
        setError(
          isZh
            ? '请为每一条费用分类选择付款账户。'
            : 'Choose a payment account for every expense split.',
        );
        return;
      }
    } else if (prepared.error || prepared.paymentAllocations.length === 0) {
      setError(
        prepared.error
          ? expensePaymentAllocationErrorMessage(prepared.error, isZh)
          : isZh
            ? '请至少选择一个付款账户，并完整分配记账总额。'
            : 'Choose at least one payment account and allocate the full booking total.',
      );
      return;
    }

    setSubmitting(true);
    try {
      if (isV2) {
        await apiFetch(
          `/accounting/expenses/${document.documentStableId}/split-funding`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              splits: document.splits.map((split) => ({
                splitStableId: split.splitStableId,
                paidFromAccountStableId: splitFunding[split.splitStableId],
              })),
            }),
          },
        );
      } else {
        await apiFetch(
          `/accounting/expenses/${document.documentStableId}/payment-allocations`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentAllocations: prepared.paymentAllocations,
            }),
          },
        );
      }
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      id="expense-editor"
      onSubmit={onSubmit}
      className="space-y-5 rounded-xl border border-amber-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {isZh ? '新增/编辑支出' : 'Add / edit expense'}
          </h2>
          <p className="mt-1 text-sm text-amber-700">
            {isZh
              ? '正在补充已确认支出的付款事实；日期、金额、费用分类和凭证不可在此修改。'
              : 'Completing payment facts for a confirmed expense. Date, amount, categories, and evidence are read-only here.'}
          </p>
        </div>
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm"
          onClick={onCancel}
        >
          {isZh ? '取消编辑' : 'Cancel edit'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? '日期' : 'Date'}
          </span>
          <input
            className="w-full rounded border bg-slate-100 px-3 py-2 text-slate-600"
            type="date"
            value={document.occurredAt?.slice(0, 10) ?? ''}
            disabled
            readOnly
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? 'CAD 记账总额' : 'CAD booking total'}
          </span>
          <div className="rounded border bg-slate-100 px-3 py-2 text-slate-600">
            CAD {money(document.totalCents)}
          </div>
        </label>
      </div>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h3 className="font-semibold">
          {isZh ? '费用分类' : 'Expense splits'}
        </h3>
        <div className="mt-2 space-y-2">
          {document.splits.map((split) => (
            <div
              key={split.splitStableId}
              className={`grid gap-2 rounded border bg-slate-100 p-3 text-sm ${
                isV2 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
              }`}
            >
              <div>
                <span className="block text-xs text-slate-500">
                  {isZh ? '类别' : 'Category'}
                </span>
                {split.categoryName}
              </div>
              <div>
                <span className="block text-xs text-slate-500">
                  {isZh ? '税前金额' : 'Before tax'}
                </span>
                {money(split.amountCents)}
              </div>
              <div>
                <span className="block text-xs text-slate-500">HST</span>
                {money(split.taxCents)}
              </div>
              {isV2 ? (
                <label className="text-sm">
                  <span className="block text-xs text-slate-500">
                    {isZh ? '付款账户' : 'Payment account'}
                  </span>
                  <select
                    className="mt-1 w-full rounded border bg-white px-2 py-1.5"
                    value={splitFunding[split.splitStableId] ?? ''}
                    disabled={Boolean(split.paidFromAccountStableId)}
                    onChange={(event) =>
                      setSplitFunding((current) => ({
                        ...current,
                        [split.splitStableId]: event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {isZh ? '请选择' : 'Choose account'}
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
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {!isV2 ? (
        <ExpensePaymentAllocationsEditor
          accounts={accounts}
          totalCents={document.totalCents ?? 0}
          allocations={paymentAllocations}
          onChange={setPaymentAllocations}
          isZh={isZh}
          allowUnknown={false}
        />
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h3 className="font-semibold">
          {isZh ? '凭证文件' : 'Evidence files'}
        </h3>
        <div className="mt-2">
          {document.sourceEvidence ? (
            <AccountingEvidenceViewer
              evidence={{
                artifactStableId: document.sourceEvidence.artifactStableId,
                filename: document.sourceEvidence.originalFilename,
                kind: document.sourceEvidence.kind,
              }}
              isZh={isZh}
              label={isZh ? '查看凭证' : 'View receipt'}
              className="inline-flex rounded border bg-white px-3 py-2 text-sm text-blue-600"
            />
          ) : document.attachmentUrls[0] ? (
            <a
              className="inline-flex rounded border bg-white px-3 py-2 text-sm text-blue-600"
              href={document.attachmentUrls[0]}
              download
            >
              {isZh ? '下载凭证' : 'Download receipt'}
            </a>
          ) : (
            <span className="text-sm text-slate-500">
              {isZh ? '无凭证' : 'No evidence'}
            </span>
          )}
        </div>
      </section>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-500">
          {isZh ? '备注' : 'Memo'}
        </span>
        <textarea
          className="min-h-20 w-full rounded border bg-slate-100 px-3 py-2 text-slate-600"
          value={document.memo ?? ''}
          disabled
          readOnly
        />
      </label>

      {error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={
          submitting ||
          (isV2
            ? document.splits.some(
                (split) => !splitFunding[split.splitStableId]?.trim(),
              )
            : prepared.paymentAllocations.length === 0 ||
              Boolean(prepared.error))
        }
        className="rounded bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting
          ? isZh
            ? '保存中…'
            : 'Saving…'
          : isZh
            ? '保存付款信息'
            : 'Save payment info'}
      </button>
    </form>
  );
}
