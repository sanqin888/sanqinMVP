'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { apiFetch, getApiErrorMessage } from '@/lib/api/client';
import type {
  AccountingExternalSaleFormOptions,
  AccountingExternalSaleListItem,
  AccountingExternalSaleSettlement,
  AccountingExternalSaleSettlementWriteResult,
  CreateAccountingExternalSaleSettlementInput,
} from '../contracts/external-sales';
import {
  ExternalSaleAllocationEditor,
  ExternalSaleSettlementComponentEditor,
  type AllocationDraft,
  type ComponentDraft,
} from './external-sale-settlement-editors';
import {
  centsToDollars,
  dollarsToCents,
  localDateToday,
  newRequestId,
} from './external-sales-utils';

export function ExternalSaleSettlementForm({
  options,
  sales,
  prefill,
  initialSaleStableId,
  isZh,
  onSaved,
  onCancelPrefill,
}: {
  options: AccountingExternalSaleFormOptions;
  sales: AccountingExternalSaleListItem[];
  prefill: AccountingExternalSaleSettlement | null;
  initialSaleStableId: string | null;
  isZh: boolean;
  onSaved: (settlementStableId: string) => void;
  onCancelPrefill: () => void;
}) {
  const openSales = useMemo(
    () =>
      sales.filter(
        (sale) => sale.status !== 'REVERSED' && sale.outstandingCents > 0,
      ),
    [sales],
  );
  const saleById = useMemo(
    () => new Map(sales.map((sale) => [sale.externalSaleStableId, sale])),
    [sales],
  );
  const [settlementOn, setSettlementOn] = useState(localDateToday());
  const [counterpartyName, setCounterpartyName] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  const [collectionAccountStableId, setCollectionAccountStableId] =
    useState('');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [expenseComponents, setExpenseComponents] = useState<ComponentDraft[]>(
    [],
  );
  const [hstRecoverableAmount, setHstRecoverableAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (prefill) {
      setSettlementOn(prefill.settlementOn);
      setCounterpartyName(prefill.counterpartyName);
      setReference(prefill.reference ?? '');
      setAllocations(
        prefill.allocations.map((allocation) => ({
          externalSaleStableId: allocation.externalSaleStableId,
          amount: centsToDollars(allocation.amountCents),
        })),
      );
      const collection = prefill.components.find(
        (component) => component.role === 'COLLECTION',
      );
      setCollectionAccountStableId(collection?.accountStableId ?? '');
      setCollectionAmount(
        collection ? centsToDollars(collection.amountCents) : '',
      );
      setExpenseComponents(
        prefill.components
          .filter((component) => component.role === 'EXPENSE')
          .map((component) => ({
            accountStableId: component.accountStableId,
            amount: centsToDollars(component.amountCents),
            label: component.label,
          })),
      );
      const recoverable = prefill.components.find(
        (component) => component.role === 'HST_RECOVERABLE',
      );
      setHstRecoverableAmount(
        recoverable ? centsToDollars(recoverable.amountCents) : '',
      );
      setNote(prefill.note ?? '');
      setFeedback(null);
      return;
    }
    if (!initialSaleStableId) return;
    const sale = saleById.get(initialSaleStableId);
    if (!sale || sale.outstandingCents <= 0) return;
    setCounterpartyName(sale.counterpartyName);
    setAllocations([
      {
        externalSaleStableId: sale.externalSaleStableId,
        amount: centsToDollars(sale.outstandingCents),
      },
    ]);
    setFeedback(null);
  }, [
    initialSaleStableId,
    options.settlement.collectionAccounts,
    options.settlement.expenseAccounts,
    options.settlement.hstRecoverableAccount?.accountStableId,
    prefill,
    saleById,
  ]);

  const replacementForSettlementStableId =
    prefill?.settlementStableId ?? null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    if (
      !settlementOn ||
      !counterpartyName.trim() ||
      allocations.length === 0 ||
      !collectionAccountStableId
    ) {
      setFeedback(
        isZh
          ? '结算日期、交易对方、至少一条应收分配和明确的收款账户均为必填。'
          : 'Settlement date, counterparty, receivable allocation and an explicit collection account are required.',
      );
      return;
    }

    const normalizedAllocations: CreateAccountingExternalSaleSettlementInput['allocations'] =
      [];
    for (const allocation of allocations) {
      const amountCents = dollarsToCents(allocation.amount);
      const sale = saleById.get(allocation.externalSaleStableId);
      if (
        !sale ||
        sale.counterpartyName !== counterpartyName.trim() ||
        amountCents === null ||
        amountCents <= 0
      ) {
        setFeedback(
          isZh
            ? '每条应收分配必须选择同一交易对方的有效销售并填写正数金额。'
            : 'Each allocation must reference the same counterparty and a positive amount.',
        );
        return;
      }
      normalizedAllocations.push({
        externalSaleStableId: allocation.externalSaleStableId,
        amountCents,
      });
    }

    const collectionCents = dollarsToCents(collectionAmount);
    const collectionAccountAllowed =
      options.settlement.collectionAccounts.some(
        (account) =>
          account.accountStableId === collectionAccountStableId,
      );
    if (
      collectionCents === null ||
      collectionCents <= 0 ||
      !collectionAccountAllowed
    ) {
      setFeedback(
        isZh
          ? '请明确填写实际进入银行/现金账户的正数金额。'
          : 'Enter the positive amount actually collected into BANK/CASH.',
      );
      return;
    }

    const components: CreateAccountingExternalSaleSettlementInput['components'] =
      [
        {
          accountStableId: collectionAccountStableId,
          amountCents: collectionCents,
          label: isZh ? '实际收款' : 'Collection',
        },
      ];

    for (const component of expenseComponents) {
      const amountCents = dollarsToCents(component.amount);
      const expenseAccountAllowed =
        options.settlement.expenseAccounts.some(
          (account) =>
            account.accountStableId === component.accountStableId,
        );
      if (
        !component.accountStableId ||
        !expenseAccountAllowed ||
        !component.label.trim() ||
        amountCents === null ||
        amountCents <= 0
      ) {
        setFeedback(
          isZh
            ? '结算费用必须填写账户、说明和正数金额。'
            : 'Settlement expenses require an account, label and positive amount.',
        );
        return;
      }
      components.push({
        accountStableId: component.accountStableId,
        amountCents,
        label: component.label.trim(),
      });
    }

    if (hstRecoverableAmount.trim()) {
      const amountCents = dollarsToCents(hstRecoverableAmount);
      const hst = options.settlement.hstRecoverableAccount;
      if (!hst || amountCents === null || amountCents <= 0) {
        setFeedback(
          isZh
            ? '可抵扣 HST 金额或账户不可用。'
            : 'Recoverable HST amount or account is unavailable.',
        );
        return;
      }
      components.push({
        accountStableId: hst.accountStableId,
        amountCents,
        label: 'HST recoverable',
      });
    }

    const body: CreateAccountingExternalSaleSettlementInput = {
      requestId: newRequestId(),
      storeStableId: options.store.storeStableId,
      settlementOn,
      counterpartyName: counterpartyName.trim(),
      reference: reference.trim() || null,
      currency: 'CAD',
      replacementForSettlementStableId,
      allocations: normalizedAllocations,
      components,
      note: note.trim() || null,
    };

    setBusy(true);
    try {
      const created =
        await apiFetch<AccountingExternalSaleSettlementWriteResult>(
          '/accounting/external-sales/settlements',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
      setFeedback(
        isZh
          ? '结算已按后端应收与账户权威入账。'
          : 'Settlement posted against backend receivable/account authority.',
      );
      onSaved(created.settlementStableId);
      if (replacementForSettlementStableId) onCancelPrefill();
    } catch (error) {
      setFeedback(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">
          {replacementForSettlementStableId
            ? isZh
              ? '创建订正替代结算'
              : 'Create corrected replacement settlement'
            : isZh
              ? '登记外部销售回款 / 扣费'
              : 'Record external sale settlement'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? 'Outstanding AR 直接来自后端 canonical Journal + 有效结算；收款账户必须明确选择，不设默认银行。'
            : 'Outstanding AR comes from backend canonical Journal plus live settlements. Collection account is always explicit; no default bank is assumed.'}
        </p>
        {replacementForSettlementStableId ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {isZh ? '替代前序结算：' : 'Replacing settlement: '}
            <span className="break-all font-mono text-xs">
              {replacementForSettlementStableId}
            </span>
            <button
              type="button"
              onClick={onCancelPrefill}
              className="ml-3 font-semibold underline"
            >
              {isZh ? '取消订正' : 'Cancel correction'}
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">
            {isZh ? '结算日期' : 'Settlement date'}
          </span>
          <input
            type="date"
            value={settlementOn}
            onChange={(event) => setSettlementOn(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">
            {isZh ? '交易对方' : 'Counterparty'}
          </span>
          <input
            value={counterpartyName}
            onChange={(event) => setCounterpartyName(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">
            {isZh ? '参考号' : 'Reference'}
          </span>
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">
            {isZh ? '备注' : 'Note'}
          </span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </label>
      </div>

      <ExternalSaleAllocationEditor
        openSales={openSales}
        saleById={saleById}
        counterpartyName={counterpartyName}
        allocations={allocations}
        setAllocations={setAllocations}
        setCounterpartyName={setCounterpartyName}
        isZh={isZh}
      />

      <ExternalSaleSettlementComponentEditor
        options={options}
        collectionAccountStableId={collectionAccountStableId}
        setCollectionAccountStableId={setCollectionAccountStableId}
        collectionAmount={collectionAmount}
        setCollectionAmount={setCollectionAmount}
        expenseComponents={expenseComponents}
        setExpenseComponents={setExpenseComponents}
        hstRecoverableAmount={hstRecoverableAmount}
        setHstRecoverableAmount={setHstRecoverableAmount}
        isZh={isZh}
      />

      {feedback ? (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {feedback}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded-xl bg-[#87362E] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy
          ? isZh
            ? '正在入账…'
            : 'Posting…'
          : replacementForSettlementStableId
            ? isZh
              ? '确认创建替代结算'
              : 'Create replacement settlement'
            : isZh
              ? '确认结算并入账'
              : 'Post settlement'}
      </button>
    </form>
  );
}
