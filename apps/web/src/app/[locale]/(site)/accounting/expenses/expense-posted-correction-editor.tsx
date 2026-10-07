'use client';

import type { AccountingAccount, AccountingCategory } from '../contracts/chart';

export type EditableExpenseCorrectionSplit = {
  splitStableId: string;
  categoryStableId: string;
  amountText: string;
  taxText: string;
  paidFromAccountStableId: string | null;
  fundingTouched: boolean;
};

export type EditableExpenseCorrectionAllocation = {
  paymentAllocationStableId: string;
  accountStableId: string;
  amountText: string;
};

type Props = {
  isZh: boolean;
  fundingVersion: 1 | 2;
  totalText: string;
  memo: string;
  splits: EditableExpenseCorrectionSplit[];
  allocations: EditableExpenseCorrectionAllocation[];
  categories: AccountingCategory[];
  accounts: AccountingAccount[];
  disabled: boolean;
  onTotalTextChange: (value: string) => void;
  onMemoChange: (value: string) => void;
  onSplitsChange: (value: EditableExpenseCorrectionSplit[]) => void;
  onAllocationsChange: (value: EditableExpenseCorrectionAllocation[]) => void;
  onAllocationTouched: () => void;
  onDirty: () => void;
};

const newStableId = (kind: 'split' | 'allocation'): string =>
  `expense-correction-${kind}-${globalThis.crypto.randomUUID()}`;

export function ExpensePostedCorrectionEditor({
  isZh,
  fundingVersion,
  totalText,
  memo,
  splits,
  allocations,
  categories,
  accounts,
  disabled,
  onTotalTextChange,
  onMemoChange,
  onSplitsChange,
  onAllocationsChange,
  onAllocationTouched,
  onDirty,
}: Props) {
  const expenseCategories = categories.filter(
    (category) => category.type === 'EXPENSE' && category.isActive,
  );
  const v2Accounts = accounts.filter(
    (account) =>
      account.currency === 'CAD' &&
      account.accountClass === 'ASSET' &&
      (account.type === 'BANK' ||
        account.type === 'CASH' ||
        account.type === 'PLATFORM_WALLET'),
  );
  const v1Accounts = accounts.filter((account) => account.currency === 'CAD');
  const fundingAccounts = fundingVersion === 2 ? v2Accounts : v1Accounts;

  function patchSplit(
    splitStableId: string,
    patch: Partial<EditableExpenseCorrectionSplit>,
  ) {
    onSplitsChange(
      splits.map((split) =>
        split.splitStableId === splitStableId ? { ...split, ...patch } : split,
      ),
    );
    onDirty();
  }

  function addSplit() {
    onSplitsChange([
      ...splits,
      {
        splitStableId: newStableId('split'),
        categoryStableId: expenseCategories[0]?.categoryStableId ?? '',
        amountText: '0.00',
        taxText: '0.00',
        paidFromAccountStableId: null,
        fundingTouched: fundingVersion === 2,
      },
    ]);
    onDirty();
  }

  function removeSplit(splitStableId: string) {
    onSplitsChange(
      splits.filter((split) => split.splitStableId !== splitStableId),
    );
    onDirty();
  }

  function patchAllocation(
    paymentAllocationStableId: string,
    patch: Partial<EditableExpenseCorrectionAllocation>,
  ) {
    onAllocationsChange(
      allocations.map((allocation) =>
        allocation.paymentAllocationStableId === paymentAllocationStableId
          ? { ...allocation, ...patch }
          : allocation,
      ),
    );
    onAllocationTouched();
    onDirty();
  }

  function addAllocation() {
    onAllocationsChange([
      ...allocations,
      {
        paymentAllocationStableId: newStableId('allocation'),
        accountStableId: fundingAccounts[0]?.accountStableId ?? '',
        amountText: '0.00',
      },
    ]);
    onAllocationTouched();
    onDirty();
  }

  function removeAllocation(paymentAllocationStableId: string) {
    onAllocationsChange(
      allocations.filter(
        (allocation) =>
          allocation.paymentAllocationStableId !== paymentAllocationStableId,
      ),
    );
    onAllocationTouched();
    onDirty();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className="text-slate-600">
            {isZh ? '更正后总额（CAD）' : 'Corrected total (CAD)'}
          </span>
          <input
            value={totalText}
            onChange={(event) => {
              onTotalTextChange(event.target.value);
              onDirty();
            }}
            disabled={disabled}
            inputMode="decimal"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-xs">
          <span className="text-slate-600">{isZh ? '备注' : 'Memo'}</span>
          <input
            value={memo}
            onChange={(event) => {
              onMemoChange(event.target.value);
              onDirty();
            }}
            disabled={disabled}
            maxLength={2000}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {isZh ? '费用拆分' : 'Expense splits'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {fundingVersion === 2
                ? isZh
                  ? '未改付款账户时继承 Current Effective；显式选择“未指定”会清空 funding，DRAFT 可保存，但 Preview/READY 会阻止。'
                  : 'Untouched funding inherits Current Effective. Choosing Unassigned explicitly clears funding; DRAFT can save, but Preview/READY will block.'
                : isZh
                  ? '历史 v1 的付款归属继续由下方 document-level allocations 管理。'
                  : 'Historical v1 funding remains document-level allocations below.'}
            </p>
          </div>
          <button
            type="button"
            onClick={addSplit}
            disabled={disabled}
            className="rounded border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {isZh ? '新增拆分' : 'Add split'}
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[820px] w-full text-left text-xs">
            <thead className="border-b bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-2">{isZh ? '分类' : 'Category'}</th>
                <th className="px-2 py-2 text-right">
                  {isZh ? '未税金额' : 'Amount'}
                </th>
                <th className="px-2 py-2 text-right">{isZh ? '税' : 'Tax'}</th>
                {fundingVersion === 2 ? (
                  <th className="px-2 py-2">
                    {isZh ? '付款账户' : 'Paid from'}
                  </th>
                ) : null}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {splits.map((split) => (
                <tr key={split.splitStableId}>
                  <td className="px-2 py-2">
                    <select
                      value={split.categoryStableId}
                      disabled={disabled}
                      onChange={(event) =>
                        patchSplit(split.splitStableId, {
                          categoryStableId: event.target.value,
                        })
                      }
                      className="w-full min-w-48 rounded border bg-white px-2 py-1.5"
                    >
                      {expenseCategories.map((category) => (
                        <option
                          key={category.categoryStableId}
                          value={category.categoryStableId}
                        >
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      value={split.amountText}
                      disabled={disabled}
                      onChange={(event) =>
                        patchSplit(split.splitStableId, {
                          amountText: event.target.value,
                        })
                      }
                      inputMode="decimal"
                      className="w-28 rounded border px-2 py-1.5 text-right"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      value={split.taxText}
                      disabled={disabled}
                      onChange={(event) =>
                        patchSplit(split.splitStableId, {
                          taxText: event.target.value,
                        })
                      }
                      inputMode="decimal"
                      className="w-24 rounded border px-2 py-1.5 text-right"
                    />
                  </td>
                  {fundingVersion === 2 ? (
                    <td className="px-2 py-2">
                      <select
                        value={split.paidFromAccountStableId ?? ''}
                        disabled={disabled}
                        onChange={(event) =>
                          patchSplit(split.splitStableId, {
                            paidFromAccountStableId:
                              event.target.value || null,
                            fundingTouched: true,
                          })
                        }
                        className="min-w-48 rounded border bg-white px-2 py-1.5"
                      >
                        <option value="">
                          {isZh ? '未指定（显式清空）' : 'Unassigned (explicit clear)'}
                        </option>
                        {fundingAccounts.map((account) => (
                          <option
                            key={account.accountStableId}
                            value={account.accountStableId}
                          >
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  ) : null}
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeSplit(split.splitStableId)}
                      disabled={disabled || splits.length <= 1}
                      className="rounded border border-red-200 px-2 py-1 text-red-700 disabled:opacity-40"
                    >
                      {isZh ? '删除' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {fundingVersion === 1 ? (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {isZh ? '历史 v1 付款分配' : 'Historical v1 payment allocations'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {isZh
                  ? '不修改时继承 Current Effective；清空全部 allocations 代表 unresolved，不会偷偷转换为 v2 split funding。'
                  : 'Untouched allocations inherit Current Effective. Clearing all allocations means unresolved and never converts v1 into v2 split funding.'}
              </p>
            </div>
            <button
              type="button"
              onClick={addAllocation}
              disabled={disabled}
              className="rounded border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {isZh ? '新增付款分配' : 'Add allocation'}
            </button>
          </div>
          {allocations.map((allocation) => (
            <div
              key={allocation.paymentAllocationStableId}
              className="grid gap-2 sm:grid-cols-[1fr_120px_auto]"
            >
              <select
                value={allocation.accountStableId}
                disabled={disabled}
                onChange={(event) =>
                  patchAllocation(allocation.paymentAllocationStableId, {
                    accountStableId: event.target.value,
                  })
                }
                className="rounded border bg-white px-2 py-2 text-xs"
              >
                {fundingAccounts.map((account) => (
                  <option
                    key={account.accountStableId}
                    value={account.accountStableId}
                  >
                    {account.name}
                  </option>
                ))}
              </select>
              <input
                value={allocation.amountText}
                disabled={disabled}
                onChange={(event) =>
                  patchAllocation(allocation.paymentAllocationStableId, {
                    amountText: event.target.value,
                  })
                }
                inputMode="decimal"
                className="rounded border px-2 py-2 text-right text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  removeAllocation(allocation.paymentAllocationStableId)
                }
                disabled={disabled}
                className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-40"
              >
                {isZh ? '删除' : 'Remove'}
              </button>
            </div>
          ))}
          {!allocations.length ? (
            <p className="text-xs text-amber-700">
              {isZh
                ? '当前付款分配为空；可以保存 DRAFT，但 Preview/READY 会因 funding unresolved 而阻止。'
                : 'Payment allocations are empty. DRAFT can be saved, but Preview/READY will block while funding is unresolved.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
