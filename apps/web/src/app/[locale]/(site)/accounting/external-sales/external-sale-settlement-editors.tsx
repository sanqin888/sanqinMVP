'use client';

import type { Dispatch, SetStateAction } from 'react';

import type {
  AccountingExternalSaleFormOptions,
  AccountingExternalSaleListItem,
} from '../contracts/external-sales';
import { centsToDollars, money } from './external-sales-utils';

export type AllocationDraft = {
  externalSaleStableId: string;
  amount: string;
};

export type ComponentDraft = {
  accountStableId: string;
  amount: string;
  label: string;
};

export function ExternalSaleAllocationEditor({
  openSales,
  saleById,
  counterpartyName,
  allocations,
  setAllocations,
  setCounterpartyName,
  isZh,
}: {
  openSales: AccountingExternalSaleListItem[];
  saleById: Map<string, AccountingExternalSaleListItem>;
  counterpartyName: string;
  allocations: AllocationDraft[];
  setAllocations: Dispatch<SetStateAction<AllocationDraft[]>>;
  setCounterpartyName: Dispatch<SetStateAction<string>>;
  isZh: boolean;
}) {
  const addAllocation = () => {
    const selectedIds = new Set(
      allocations.map((allocation) => allocation.externalSaleStableId),
    );
    const next = openSales.find(
      (sale) =>
        !selectedIds.has(sale.externalSaleStableId) &&
        (!counterpartyName || sale.counterpartyName === counterpartyName),
    );
    setAllocations((current) => [
      ...current,
      {
        externalSaleStableId: next?.externalSaleStableId ?? '',
        amount: '',
      },
    ]);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">
          {isZh ? '应收分配' : 'Receivable allocations'}
        </h3>
        <button
          type="button"
          onClick={addAllocation}
          className="rounded-lg border px-3 py-2 text-sm font-medium"
        >
          {isZh ? '添加应收' : 'Add receivable'}
        </button>
      </div>
      {allocations.map((allocation, index) => {
        const sale = saleById.get(allocation.externalSaleStableId);
        return (
          <div
            key={index}
            className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]"
          >
            <select
              value={allocation.externalSaleStableId}
              onChange={(event) => {
                const externalSaleStableId = event.target.value;
                const selected = saleById.get(externalSaleStableId);
                setAllocations((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          externalSaleStableId,
                          amount: selected
                            ? centsToDollars(selected.outstandingCents)
                            : '',
                        }
                      : item,
                  ),
                );
                if (selected && !counterpartyName) {
                  setCounterpartyName(selected.counterpartyName);
                }
              }}
              className="min-w-0 rounded-lg border bg-white px-3 py-2"
            >
              <option value="">
                {isZh ? '选择未结应收…' : 'Select outstanding sale…'}
              </option>
              {openSales
                .filter(
                  (item) =>
                    !counterpartyName ||
                    item.counterpartyName === counterpartyName ||
                    item.externalSaleStableId ===
                      allocation.externalSaleStableId,
                )
                .map((item) => (
                  <option
                    key={item.externalSaleStableId}
                    value={item.externalSaleStableId}
                  >
                    {item.occurredOn} · {item.counterpartyName} ·{' '}
                    {money(item.outstandingCents)}
                  </option>
                ))}
            </select>
            <input
              value={allocation.amount}
              onChange={(event) =>
                setAllocations((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, amount: event.target.value }
                      : item,
                  ),
                )
              }
              inputMode="decimal"
              placeholder={isZh ? '分配 CAD' : 'Allocation CAD'}
              className="rounded-lg border px-3 py-2"
            />
            <button
              type="button"
              onClick={() =>
                setAllocations((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
              className="text-sm font-medium text-red-700"
            >
              {isZh ? '删除' : 'Remove'}
            </button>
            {sale ? (
              <p className="text-xs text-slate-500 sm:col-span-3">
                {isZh ? '后端未结余额：' : 'Backend outstanding: '}
                {money(sale.outstandingCents)} ·{' '}
                <span className="font-mono">
                  {sale.externalSaleStableId}
                </span>
              </p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

export function ExternalSaleSettlementComponentEditor({
  options,
  collectionAccountStableId,
  setCollectionAccountStableId,
  collectionAmount,
  setCollectionAmount,
  expenseComponents,
  setExpenseComponents,
  hstRecoverableAmount,
  setHstRecoverableAmount,
  isZh,
}: {
  options: AccountingExternalSaleFormOptions;
  collectionAccountStableId: string;
  setCollectionAccountStableId: Dispatch<SetStateAction<string>>;
  collectionAmount: string;
  setCollectionAmount: Dispatch<SetStateAction<string>>;
  expenseComponents: ComponentDraft[];
  setExpenseComponents: Dispatch<SetStateAction<ComponentDraft[]>>;
  hstRecoverableAmount: string;
  setHstRecoverableAmount: Dispatch<SetStateAction<string>>;
  isZh: boolean;
}) {
  return (
    <>
      <section className="space-y-3">
        <h3 className="font-semibold">
          {isZh ? '实际到账' : 'Actual collection'}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={collectionAccountStableId}
            onChange={(event) =>
              setCollectionAccountStableId(event.target.value)
            }
            className="rounded-lg border bg-white px-3 py-2"
          >
            <option value="">
              {isZh
                ? '明确选择 BANK / CASH…'
                : 'Explicitly choose BANK / CASH…'}
            </option>
            {collectionAccountStableId &&
            !options.settlement.collectionAccounts.some(
              (account) =>
                account.accountStableId === collectionAccountStableId,
            ) ? (
              <option value={collectionAccountStableId} disabled>
                {isZh ? '历史账户已不可用：' : 'Historical account unavailable: '}
                {collectionAccountStableId}
              </option>
            ) : null}
            {options.settlement.collectionAccounts.map((account) => (
              <option
                key={account.accountStableId}
                value={account.accountStableId}
              >
                {account.name}
              </option>
            ))}
          </select>
          <input
            value={collectionAmount}
            onChange={(event) => setCollectionAmount(event.target.value)}
            inputMode="decimal"
            placeholder={isZh ? '实际到账 CAD' : 'Collected CAD'}
            className="rounded-lg border px-3 py-2"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">
            {isZh ? '结算费用 / 扣费' : 'Settlement fees / deductions'}
          </h3>
          <button
            type="button"
            onClick={() =>
              setExpenseComponents((current) => [
                ...current,
                {
                  accountStableId:
                    options.settlement.expenseAccounts[0]?.accountStableId ??
                    '',
                  amount: '',
                  label: '',
                },
              ])
            }
            className="rounded-lg border px-3 py-2 text-sm font-medium"
          >
            {isZh ? '添加费用' : 'Add fee'}
          </button>
        </div>
        {expenseComponents.map((component, index) => {
          const currentAccountAvailable =
            options.settlement.expenseAccounts.some(
              (account) =>
                account.accountStableId === component.accountStableId,
            );
          return (
            <div
              key={index}
              className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-3"
            >
              <select
                value={component.accountStableId}
                onChange={(event) =>
                  setExpenseComponents((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, accountStableId: event.target.value }
                        : item,
                    ),
                  )
                }
                className="rounded-lg border bg-white px-3 py-2"
              >
                {!currentAccountAvailable && component.accountStableId ? (
                  <option value={component.accountStableId} disabled>
                    {isZh
                      ? '历史账户已不可用：'
                      : 'Historical account unavailable: '}
                    {component.accountStableId}
                  </option>
                ) : null}
                {options.settlement.expenseAccounts.map((account) => (
                  <option
                    key={account.accountStableId}
                    value={account.accountStableId}
                  >
                    {account.name}
                  </option>
                ))}
              </select>
              <input
                value={component.amount}
                onChange={(event) =>
                  setExpenseComponents((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, amount: event.target.value }
                        : item,
                    ),
                  )
                }
                inputMode="decimal"
                placeholder={isZh ? '费用 CAD' : 'Fee CAD'}
                className="rounded-lg border px-3 py-2"
              />
              <input
                value={component.label}
                onChange={(event) =>
                  setExpenseComponents((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, label: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder={isZh ? '费用说明' : 'Fee label'}
                className="rounded-lg border px-3 py-2"
              />
              <button
                type="button"
                onClick={() =>
                  setExpenseComponents((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                className="text-left text-sm font-medium text-red-700"
              >
                {isZh ? '删除费用' : 'Remove fee'}
              </button>
            </div>
          );
        })}
        {options.settlement.hstRecoverableAccount ||
        hstRecoverableAmount.trim() ? (
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">
              {isZh
                ? '费用中的可抵扣 HST（如有）'
                : 'Recoverable HST on settlement fees (if any)'}
            </span>
            {!options.settlement.hstRecoverableAccount &&
            hstRecoverableAmount.trim() ? (
              <span className="mb-1 block text-xs font-medium text-amber-700">
                {isZh
                  ? '历史 HST Recoverable 账户当前不可用；必须清空或恢复可用账户后才能提交。'
                  : 'The historical HST Recoverable account is unavailable; clear this amount or restore an allowed account before posting.'}
              </span>
            ) : null}
            <input
              value={hstRecoverableAmount}
              onChange={(event) =>
                setHstRecoverableAmount(event.target.value)
              }
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded-lg border px-3 py-2 sm:max-w-xs"
            />
          </label>
        ) : null}
      </section>
    </>
  );
}
