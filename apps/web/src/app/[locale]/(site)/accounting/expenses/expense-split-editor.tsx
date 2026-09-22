'use client';

import type { AccountingAccount, AccountingCategory } from '../contracts/chart';

export type ExpenseSplitTaxMode = 'EXEMPT' | 'HST13' | 'MANUAL';

export type ExpenseSplitDraft = {
  key: string;
  categoryStableId: string;
  amount: string;
  taxMode: ExpenseSplitTaxMode;
  manualTax: string;
  paidFromAccountStableId: string;
};

type Props = {
  isZh: boolean;
  splits: ExpenseSplitDraft[];
  expenseCategories: AccountingCategory[];
  accounts: AccountingAccount[];
  categoryParents: Map<string, string>;
  taxCentsByKey: Map<string, number>;
  onAdd: () => void;
  onChange: (splits: ExpenseSplitDraft[]) => void;
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function ExpenseSplitEditor({
  isZh,
  splits,
  expenseCategories,
  accounts,
  categoryParents,
  taxCentsByKey,
  onAdd,
  onChange,
}: Props) {
  function patchSplit(
    key: string,
    patch: Partial<ExpenseSplitDraft>,
  ) {
    onChange(
      splits.map((item) =>
        item.key === key ? { ...item, ...patch } : item,
      ),
    );
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          {isZh ? '费用分类' : 'Expense splits'}
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="rounded border px-3 py-1.5 text-sm"
        >
          + {isZh ? '增加类别' : 'Add category'}
        </button>
      </div>

      <div className="space-y-2">
        {splits.map((split) => (
          <div
            key={split.key}
            className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[1.5fr_130px_125px_120px_180px_70px] md:items-end"
          >
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">
                {isZh ? '类别' : 'Category'}
              </span>
              <select
                className="w-full rounded border bg-white px-3 py-2"
                value={split.categoryStableId}
                onChange={(event) =>
                  patchSplit(split.key, {
                    categoryStableId: event.target.value,
                  })
                }
              >
                {expenseCategories.map((category) => (
                  <option
                    key={category.categoryStableId}
                    value={category.categoryStableId}
                  >
                    {categoryParents.get(category.parentStableId ?? '')
                      ? `${categoryParents.get(
                          category.parentStableId ?? '',
                        )} › `
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
                inputMode="decimal"
                value={split.amount}
                onChange={(event) =>
                  patchSplit(split.key, { amount: event.target.value })
                }
                placeholder="0.00"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-slate-500">
                {isZh ? '税' : 'Tax'}
              </span>
              <select
                className="w-full rounded border bg-white px-3 py-2"
                value={split.taxMode}
                onChange={(event) =>
                  patchSplit(split.key, {
                    taxMode: event.target.value as ExpenseSplitTaxMode,
                  })
                }
              >
                <option value="EXEMPT">{isZh ? '免税' : 'Exempt'}</option>
                <option value="HST13">HST 13%</option>
                <option value="MANUAL">
                  {isZh ? '手动税额' : 'Manual tax'}
                </option>
              </select>
            </label>

            {split.taxMode === 'MANUAL' ? (
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">HST</span>
                <input
                  className="w-full rounded border bg-white px-3 py-2"
                  inputMode="decimal"
                  value={split.manualTax}
                  onChange={(event) =>
                    patchSplit(split.key, {
                      manualTax: event.target.value,
                    })
                  }
                  placeholder="0.00"
                />
              </label>
            ) : (
              <div className="pb-2 text-sm text-slate-600">
                HST {money(taxCentsByKey.get(split.key) ?? 0)}
              </div>
            )}

            <label className="text-sm">
              <span className="mb-1 block text-slate-500">
                {isZh ? '付款账户' : 'Payment account'}
              </span>
              <select
                className="w-full rounded border bg-white px-3 py-2"
                value={split.paidFromAccountStableId}
                onChange={(event) =>
                  patchSplit(split.key, {
                    paidFromAccountStableId: event.target.value,
                  })
                }
              >
                <option value="">
                  {isZh ? '稍后指定' : 'Assign later'}
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

            <button
              type="button"
              className="pb-2 text-sm text-red-600 disabled:text-slate-300"
              disabled={splits.length <= 1}
              onClick={() =>
                onChange(splits.filter((item) => item.key !== split.key))
              }
            >
              {isZh ? '删除' : 'Remove'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
