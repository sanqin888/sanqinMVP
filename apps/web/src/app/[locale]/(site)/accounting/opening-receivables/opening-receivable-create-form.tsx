'use client';

import { type FormEvent, type ReactNode, useState } from 'react';

import { apiFetch, getApiErrorMessage } from '@/lib/api/client';
import type {
  AccountingOpeningReceivable,
  AccountingOpeningReceivableFormOptions,
  CreateAccountingOpeningReceivableInput,
} from '../contracts/opening-receivables';
import {
  centsToDollars,
  dollarsToCents,
  newRequestId,
} from './opening-receivables-utils';

export function OpeningReceivableCreateForm({
  options,
  prefill,
  isZh,
  onSaved,
  onCancelPrefill,
}: {
  options: AccountingOpeningReceivableFormOptions;
  prefill: AccountingOpeningReceivable | null;
  isZh: boolean;
  onSaved: (openingReceivableStableId: string) => Promise<void>;
  onCancelPrefill: () => void;
}) {
  const [counterpartyName, setCounterpartyName] = useState(
    prefill?.counterpartyName ?? '',
  );
  const [amount, setAmount] = useState(
    prefill ? centsToDollars(prefill.openingAmountCents) : '',
  );
  const [reference, setReference] = useState(prefill?.reference ?? '');
  const [note, setNote] = useState(prefill?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amountCents = dollarsToCents(amount);
    if (!counterpartyName.trim() || !amountCents || amountCents <= 0) {
      setFeedback(
        isZh
          ? '交易对方和正数金额为必填。'
          : 'Counterparty and a positive amount are required.',
      );
      return;
    }

    const body: CreateAccountingOpeningReceivableInput = {
      requestId: newRequestId(),
      storeStableId: options.store.storeStableId,
      counterpartyName: counterpartyName.trim(),
      amountCents,
      currency: 'CAD',
      reference: reference.trim() || null,
      replacementForOpeningReceivableStableId:
        prefill?.openingReceivableStableId ?? null,
      note: note.trim() || null,
    };

    setBusy(true);
    setFeedback(null);
    try {
      const created = await apiFetch<AccountingOpeningReceivable>(
        '/accounting/opening-receivables',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      await onSaved(created.openingReceivableStableId);
    } catch (error) {
      setFeedback(
        getApiErrorMessage(
          error,
          isZh ? '期初应收入账失败。' : 'Failed to post opening receivable.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">
          {prefill
            ? isZh
              ? '创建订正替代期初应收'
              : 'Create corrected replacement Opening AR'
            : isZh
              ? '新增期初应收'
              : 'New opening receivable'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? 'Opening date 由后端 accountingStartDate 决定，页面不能覆盖。'
            : 'Opening date is server-owned by accountingStartDate and cannot be overridden here.'}
        </p>
        {prefill ? (
          <button
            type="button"
            onClick={onCancelPrefill}
            className="mt-2 text-sm font-semibold text-[#87362E] underline"
          >
            {isZh ? '取消订正预填' : 'Cancel correction prefill'}
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={isZh ? '交易对方' : 'Counterparty'}>
          <input
            value={counterpartyName}
            onChange={(event) => setCounterpartyName(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </Field>
        <Field label={isZh ? '期初应收金额' : 'Opening AR amount'}>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </Field>
        <Field label={isZh ? '参考号' : 'Reference'}>
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </Field>
        <Field label={isZh ? '备注' : 'Note'}>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </Field>
      </div>

      {feedback ? (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm">{feedback}</p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded-xl bg-[#87362E] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy
          ? isZh
            ? '提交中…'
            : 'Posting…'
          : isZh
            ? '确认入账'
            : 'Post opening AR'}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      {children}
    </label>
  );
}
