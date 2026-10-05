'use client';

import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useState,
} from 'react';

import { apiFetch, getApiErrorMessage } from '@/lib/api/client';
import type {
  AccountingOpeningReceivable,
  AccountingOpeningReceivableFormOptions,
  AccountingOpeningReceivableSettlement,
  CreateAccountingOpeningReceivableSettlementInput,
} from '../contracts/opening-receivables';
import {
  centsToDollars,
  dollarsToCents,
  money,
  newRequestId,
  todayInTimeZone,
} from './opening-receivables-utils';

export function OpeningReceivableSettlementForm({
  items,
  options,
  prefill,
  initialOpeningReceivableStableId,
  isZh,
  onSaved,
  onCancelPrefill,
}: {
  items: AccountingOpeningReceivable[];
  options: AccountingOpeningReceivableFormOptions;
  prefill: AccountingOpeningReceivableSettlement | null;
  initialOpeningReceivableStableId: string | null;
  isZh: boolean;
  onSaved: () => Promise<void>;
  onCancelPrefill: () => void;
}) {
  const eligible = useMemo(
    () =>
      items.filter(
        (item) => item.status !== 'REVERSED' && item.outstandingAmountCents > 0,
      ),
    [items],
  );
  const initialId =
    prefill?.openingReceivableStableId ??
    initialOpeningReceivableStableId ??
    eligible[0]?.openingReceivableStableId ??
    '';
  const [openingReceivableStableId, setOpeningReceivableStableId] =
    useState(initialId);
  const initialOpening = items.find(
    (item) => item.openingReceivableStableId === initialId,
  );
  const [settlementOn, setSettlementOn] = useState(
    prefill?.settlementOn ?? todayInTimeZone(options.store.timezone),
  );
  const [amount, setAmount] = useState(
    prefill
      ? centsToDollars(prefill.amountCents)
      : initialOpening
        ? centsToDollars(initialOpening.outstandingAmountCents)
        : '',
  );
  const [collectionAccountStableId, setCollectionAccountStableId] = useState(
    prefill?.collectionAccountStableId ?? '',
  );
  const [reference, setReference] = useState(prefill?.reference ?? '');
  const [note, setNote] = useState(prefill?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const chooseOpening = (value: string) => {
    setOpeningReceivableStableId(value);
    const opening = items.find(
      (item) => item.openingReceivableStableId === value,
    );
    if (!prefill && opening) {
      setAmount(centsToDollars(opening.outstandingAmountCents));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amountCents = dollarsToCents(amount);
    const accountAllowed = options.collectionAccounts.some(
      (account) => account.accountStableId === collectionAccountStableId,
    );
    if (
      !openingReceivableStableId ||
      !settlementOn ||
      !amountCents ||
      amountCents <= 0 ||
      !accountAllowed
    ) {
      setFeedback(
        isZh
          ? '请选择应收、日期、正数金额和明确的 BANK/CASH 收款账户。'
          : 'Choose the receivable, date, positive amount and an explicit BANK/CASH collection account.',
      );
      return;
    }

    const body: CreateAccountingOpeningReceivableSettlementInput = {
      requestId: newRequestId(),
      openingReceivableStableId,
      settlementOn,
      amountCents,
      currency: 'CAD',
      collectionAccountStableId,
      reference: reference.trim() || null,
      replacementForSettlementStableId: prefill?.settlementStableId ?? null,
      note: note.trim() || null,
    };

    setBusy(true);
    setFeedback(null);
    try {
      await apiFetch<AccountingOpeningReceivableSettlement>(
        '/accounting/opening-receivables/settlements',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      await onSaved();
    } catch (error) {
      setFeedback(
        getApiErrorMessage(
          error,
          isZh ? '回款入账失败。' : 'Failed to post collection.',
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
              ? '创建订正替代回款'
              : 'Create corrected replacement collection'
            : isZh
              ? '登记期初应收回款'
              : 'Record Opening AR collection'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '收款账户必须从后端允许的 active CAD BANK/CASH 中明确选择，不设默认账户。'
            : 'Collection account must be explicitly selected from backend-approved active CAD BANK/CASH accounts; no default account is assumed.'}
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
        <Field label={isZh ? '期初应收' : 'Opening receivable'}>
          <select
            value={openingReceivableStableId}
            onChange={(event) => chooseOpening(event.target.value)}
            disabled={Boolean(prefill)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          >
            <option value="">{isZh ? '请选择' : 'Select'}</option>
            {eligible.map((item) => (
              <option
                key={item.openingReceivableStableId}
                value={item.openingReceivableStableId}
              >
                {item.counterpartyName} · {money(item.outstandingAmountCents)}
              </option>
            ))}
            {prefill && initialOpening ? (
              <option value={initialOpening.openingReceivableStableId}>
                {initialOpening.counterpartyName}
              </option>
            ) : null}
          </select>
        </Field>

        <Field label={isZh ? '回款日期' : 'Collection date'}>
          <input
            type="date"
            value={settlementOn}
            onChange={(event) => setSettlementOn(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </Field>

        <Field label={isZh ? '回款金额' : 'Amount'}>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </Field>

        <Field label={isZh ? '收款账户' : 'Collection account'}>
          <select
            value={collectionAccountStableId}
            onChange={(event) =>
              setCollectionAccountStableId(event.target.value)
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          >
            <option value="">
              {isZh ? '明确选择账户' : 'Explicitly choose account'}
            </option>
            {options.collectionAccounts.map((account) => (
              <option
                key={account.accountStableId}
                value={account.accountStableId}
              >
                {account.name}
              </option>
            ))}
          </select>
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
            ? '确认回款'
            : 'Post collection'}
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
