'use client';

export type ExpensePaymentAccount = {
  accountStableId: string;
  name: string;
  currency: string;
};

export type ExpensePaymentAllocationDraft = {
  key: string;
  accountStableId: string;
  amount: string;
};

export type ExpensePaymentAllocationError =
  | 'ACCOUNT_REQUIRED'
  | 'AMOUNT_REQUIRED'
  | 'DUPLICATE_ACCOUNT'
  | 'NOT_BALANCED';

export type PreparedExpensePaymentAllocations = {
  paymentAllocations: Array<{
    accountStableId: string;
    amountCents: number;
  }>;
  allocatedCents: number;
  remainingCents: number;
  error: ExpensePaymentAllocationError | null;
};

type Props = {
  accounts: ExpensePaymentAccount[];
  totalCents: number;
  allocations: ExpensePaymentAllocationDraft[];
  onChange: (allocations: ExpensePaymentAllocationDraft[]) => void;
  isZh: boolean;
  allowUnknown?: boolean;
};

const money = (cents: number) => {
  const absolute = `$${(Math.abs(cents) / 100).toFixed(2)}`;
  return cents < 0 ? `-${absolute}` : absolute;
};

const dollarsToCents = (value: string) => {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

const centsToDollars = (cents: number) => (cents / 100).toFixed(2);

export const makeExpensePaymentAllocationDraft =
  (): ExpensePaymentAllocationDraft => ({
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    accountStableId: '',
    amount: '',
  });

export function prepareExpensePaymentAllocations(
  drafts: ExpensePaymentAllocationDraft[],
  totalCents: number,
): PreparedExpensePaymentAllocations {
  const nonEmpty = drafts.filter(
    (draft) => draft.accountStableId.trim() || draft.amount.trim(),
  );
  if (!nonEmpty.length) {
    return {
      paymentAllocations: [],
      allocatedCents: 0,
      remainingCents: totalCents,
      error: null,
    };
  }

  const paymentAllocations: PreparedExpensePaymentAllocations['paymentAllocations'] =
    [];
  const seenAccounts = new Set<string>();
  let allocatedCents = 0;
  let error: ExpensePaymentAllocationError | null = null;

  for (const draft of nonEmpty) {
    const accountStableId = draft.accountStableId.trim();
    const amountCents = dollarsToCents(draft.amount);
    if (!accountStableId) error ??= 'ACCOUNT_REQUIRED';
    if (amountCents <= 0) error ??= 'AMOUNT_REQUIRED';
    if (accountStableId) {
      if (seenAccounts.has(accountStableId)) error ??= 'DUPLICATE_ACCOUNT';
      seenAccounts.add(accountStableId);
    }
    if (amountCents > 0) allocatedCents += amountCents;
    if (accountStableId && amountCents > 0) {
      paymentAllocations.push({ accountStableId, amountCents });
    }
  }

  if (!error && allocatedCents !== totalCents) error = 'NOT_BALANCED';
  return {
    paymentAllocations,
    allocatedCents,
    remainingCents: totalCents - allocatedCents,
    error,
  };
}

export function expensePaymentAllocationErrorMessage(
  error: ExpensePaymentAllocationError,
  isZh: boolean,
) {
  if (error === 'ACCOUNT_REQUIRED') {
    return isZh ? '每笔付款金额都必须选择付款账户。' : 'Choose an account for every payment amount.';
  }
  if (error === 'AMOUNT_REQUIRED') {
    return isZh ? '每笔付款分配金额必须大于 0。' : 'Every payment allocation amount must be greater than 0.';
  }
  if (error === 'DUPLICATE_ACCOUNT') {
    return isZh ? '同一张费用单不能重复选择同一个付款账户。' : 'The same payment account cannot appear twice on one expense.';
  }
  return isZh
    ? '付款分配必须与 CAD 实际记账总额完全一致，或全部留空表示付款账户暂未知。'
    : 'Payment allocations must exactly match the CAD booking total, or remain completely blank when the payment account is not yet known.';
}

export function ExpensePaymentAllocationsEditor({
  accounts,
  totalCents,
  allocations,
  onChange,
  isZh,
  allowUnknown = true,
}: Props) {
  const cadAccounts = accounts.filter((account) => account.currency === 'CAD');
  const prepared = prepareExpensePaymentAllocations(allocations, totalCents);

  function updateAllocation(
    key: string,
    changes: Partial<ExpensePaymentAllocationDraft>,
  ) {
    onChange(
      allocations.map((allocation) =>
        allocation.key === key ? { ...allocation, ...changes } : allocation,
      ),
    );
  }

  function selectAccount(allocation: ExpensePaymentAllocationDraft, accountStableId: string) {
    const allocatedElsewhere = allocations.reduce((sum, candidate) => {
      if (candidate.key === allocation.key) return sum;
      return sum + Math.max(dollarsToCents(candidate.amount), 0);
    }, 0);
    const remainingCents = Math.max(totalCents - allocatedElsewhere, 0);
    updateAllocation(allocation.key, {
      accountStableId,
      amount:
        accountStableId && !allocation.amount.trim() && remainingCents > 0
          ? centsToDollars(remainingCents)
          : allocation.amount,
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <strong className="text-sm">{isZh ? '付款账户' : 'Payment accounts'}</strong>
          <p className="mt-1 text-xs text-slate-500">
            {allowUnknown
              ? isZh
                ? '可拆分到多个 CAD 账户；如果暂时不知道付款账户，可以全部留空。'
                : 'Split the payment across multiple CAD accounts, or leave all rows blank if the payment account is not known yet.'
              : isZh
                ? '请把 CAD 记账总额完整分配到一个或多个付款账户。'
                : 'Allocate the full CAD booking total across one or more payment accounts.'}
          </p>
        </div>
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() => onChange([...allocations, makeExpensePaymentAllocationDraft()])}
        >
          + {isZh ? '添加付款账户' : 'Add payment account'}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {allocations.map((allocation) => {
          const usedByOtherRows = new Set(
            allocations
              .filter((candidate) => candidate.key !== allocation.key)
              .map((candidate) => candidate.accountStableId)
              .filter(Boolean),
          );
          return (
            <div
              key={allocation.key}
              className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_160px_70px] sm:items-end"
            >
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">
                  {isZh ? '账户' : 'Account'}
                </span>
                <select
                  className="w-full rounded border bg-white px-3 py-2"
                  value={allocation.accountStableId}
                  onChange={(event) => selectAccount(allocation, event.target.value)}
                >
                  <option value="">
                    {allowUnknown
                      ? isZh
                        ? '暂不指定'
                        : 'Not specified'
                      : isZh
                        ? '选择付款账户'
                        : 'Choose payment account'}
                  </option>
                  {cadAccounts.map((account) => (
                    <option
                      key={account.accountStableId}
                      value={account.accountStableId}
                      disabled={usedByOtherRows.has(account.accountStableId)}
                    >
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">
                  {isZh ? '付款金额' : 'Amount paid'}
                </span>
                <div className="flex rounded border bg-white px-3 py-2">
                  <span className="mr-1">$</span>
                  <input
                    className="min-w-0 flex-1 outline-none"
                    inputMode="decimal"
                    value={allocation.amount}
                    onChange={(event) =>
                      updateAllocation(allocation.key, { amount: event.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>
              </label>
              <button
                type="button"
                className="pb-2 text-sm text-red-600 disabled:text-slate-300"
                disabled={allocations.length <= 1}
                onClick={() =>
                  onChange(
                    allocations.filter(
                      (candidate) => candidate.key !== allocation.key,
                    ),
                  )
                }
              >
                {isZh ? '删除' : 'Remove'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 rounded bg-slate-50 px-3 py-2 text-sm sm:grid-cols-2">
        <div>
          <span className="text-slate-500">{isZh ? '已分配' : 'Allocated'}</span>
          <strong className="ml-2">{money(prepared.allocatedCents)}</strong>
        </div>
        <div>
          <span className="text-slate-500">{isZh ? '待分配' : 'Remaining'}</span>
          <strong
            className={`ml-2 ${prepared.remainingCents === 0 ? 'text-emerald-600' : 'text-amber-600'}`}
          >
            {money(prepared.remainingCents)}
          </strong>
        </div>
      </div>
    </section>
  );
}
