'use client';

import type { Dispatch, SetStateAction } from 'react';

import type { AccountingExternalSaleFormOptions } from '../contracts/external-sales';
import { dollarsToCents } from './external-sales-utils';

export type SaleLineDraft = {
  description: string;
  productReference: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineAmount: string;
  revenueAccountStableId: string;
};

export type AdjustmentDraft = {
  label: string;
  amount: string;
  revenueAccountStableId: string;
};

export type TaxDraft = {
  taxCode: 'HST' | 'ZERO_RATED';
  amount: string;
  rateBasisPoints: number | null;
};

export const blankSaleLine = (
  options: AccountingExternalSaleFormOptions,
): SaleLineDraft => ({
  description: '',
  productReference: '',
  quantity: '1',
  unit: 'unit',
  unitPrice: '',
  lineAmount: '',
  revenueAccountStableId:
    options.sale.lineRevenueAccounts[0]?.accountStableId ?? '',
});

export function ExternalSaleLineEditor({
  options,
  lines,
  setLines,
  isZh,
}: {
  options: AccountingExternalSaleFormOptions;
  lines: SaleLineDraft[];
  setLines: Dispatch<SetStateAction<SaleLineDraft[]>>;
  isZh: boolean;
}) {
  const updateLine = (index: number, patch: Partial<SaleLineDraft>) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">
          {isZh ? '销售明细' : 'Sale lines'}
        </h3>
        <button
          type="button"
          onClick={() =>
            setLines((current) => [...current, blankSaleLine(options)])
          }
          className="rounded-lg border px-3 py-2 text-sm font-medium"
        >
          {isZh ? '添加明细' : 'Add line'}
        </button>
      </div>
      {lines.map((line, index) => (
        <div
          key={index}
          className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <input
            value={line.description}
            onChange={(event) =>
              updateLine(index, { description: event.target.value })
            }
            placeholder={isZh ? '描述' : 'Description'}
            className="rounded-lg border px-3 py-2"
          />
          <input
            value={line.productReference}
            onChange={(event) =>
              updateLine(index, { productReference: event.target.value })
            }
            placeholder={isZh ? '产品参考（可选）' : 'Product reference'}
            className="rounded-lg border px-3 py-2"
          />
          <input
            value={line.quantity}
            onChange={(event) =>
              updateLine(index, { quantity: event.target.value })
            }
            inputMode="decimal"
            placeholder={isZh ? '数量' : 'Quantity'}
            className="rounded-lg border px-3 py-2"
          />
          <input
            value={line.unit}
            onChange={(event) =>
              updateLine(index, { unit: event.target.value })
            }
            placeholder={isZh ? '单位' : 'Unit'}
            className="rounded-lg border px-3 py-2"
          />
          <input
            value={line.unitPrice}
            onChange={(event) =>
              updateLine(index, { unitPrice: event.target.value })
            }
            inputMode="decimal"
            placeholder={isZh ? '协商单价 CAD' : 'Unit price CAD'}
            className="rounded-lg border px-3 py-2"
          />
          <input
            value={line.lineAmount}
            onChange={(event) =>
              updateLine(index, { lineAmount: event.target.value })
            }
            inputMode="decimal"
            placeholder={isZh ? '明细金额 CAD' : 'Line amount CAD'}
            className="rounded-lg border px-3 py-2"
          />
          <select
            value={line.revenueAccountStableId}
            onChange={(event) =>
              updateLine(index, {
                revenueAccountStableId: event.target.value,
              })
            }
            className="rounded-lg border bg-white px-3 py-2 xl:col-span-2"
          >
            {line.revenueAccountStableId &&
            !options.sale.lineRevenueAccounts.some(
              (account) =>
                account.accountStableId === line.revenueAccountStableId,
            ) ? (
              <option value={line.revenueAccountStableId} disabled>
                {isZh ? '历史账户已不可用：' : 'Historical account unavailable: '}
                {line.revenueAccountStableId}
              </option>
            ) : null}
            {options.sale.lineRevenueAccounts.map((account) => (
              <option
                key={account.accountStableId}
                value={account.accountStableId}
              >
                {account.name}
              </option>
            ))}
          </select>
          {lines.length > 1 ? (
            <button
              type="button"
              onClick={() =>
                setLines((current) =>
                  current.filter((_, lineIndex) => lineIndex !== index),
                )
              }
              className="text-left text-sm font-medium text-red-700"
            >
              {isZh ? '删除明细' : 'Remove line'}
            </button>
          ) : null}
        </div>
      ))}
    </section>
  );
}

export function ExternalSaleAdjustmentEditor({
  options,
  adjustments,
  setAdjustments,
  isZh,
}: {
  options: AccountingExternalSaleFormOptions;
  adjustments: AdjustmentDraft[];
  setAdjustments: Dispatch<SetStateAction<AdjustmentDraft[]>>;
  isZh: boolean;
}) {
  const updateAdjustment = (
    index: number,
    patch: Partial<AdjustmentDraft>,
  ) => {
    setAdjustments((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{isZh ? '调整' : 'Adjustments'}</h3>
        <button
          type="button"
          onClick={() =>
            setAdjustments((current) => [
              ...current,
              {
                label: '',
                amount: '',
                revenueAccountStableId:
                  options.sale.positiveAdjustmentAccounts[0]
                    ?.accountStableId ?? '',
              },
            ])
          }
          className="rounded-lg border px-3 py-2 text-sm font-medium"
        >
          {isZh ? '添加调整' : 'Add adjustment'}
        </button>
      </div>
      {adjustments.map((adjustment, index) => {
        const cents = dollarsToCents(adjustment.amount);
        const accountOptions =
          cents !== null && cents < 0
            ? options.sale.negativeAdjustmentAccounts
            : options.sale.positiveAdjustmentAccounts;
        return (
          <div
            key={index}
            className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-3"
          >
            <input
              value={adjustment.label}
              onChange={(event) =>
                updateAdjustment(index, { label: event.target.value })
              }
              placeholder={isZh ? '调整说明' : 'Adjustment label'}
              className="rounded-lg border px-3 py-2"
            />
            <input
              value={adjustment.amount}
              onChange={(event) => {
                const next = event.target.value;
                const nextCents = dollarsToCents(next);
                const nextOptions =
                  nextCents !== null && nextCents < 0
                    ? options.sale.negativeAdjustmentAccounts
                    : options.sale.positiveAdjustmentAccounts;
                updateAdjustment(index, {
                  amount: next,
                  revenueAccountStableId: nextOptions.some(
                    (option) =>
                      option.accountStableId ===
                      adjustment.revenueAccountStableId,
                  )
                    ? adjustment.revenueAccountStableId
                    : nextOptions[0]?.accountStableId ?? '',
                });
              }}
              inputMode="decimal"
              placeholder={isZh ? '有符号金额 CAD' : 'Signed amount CAD'}
              className="rounded-lg border px-3 py-2"
            />
            <select
              value={adjustment.revenueAccountStableId}
              onChange={(event) =>
                updateAdjustment(index, {
                  revenueAccountStableId: event.target.value,
                })
              }
              className="rounded-lg border bg-white px-3 py-2"
            >
              {adjustment.revenueAccountStableId &&
              !accountOptions.some(
                (account) =>
                  account.accountStableId ===
                  adjustment.revenueAccountStableId,
              ) ? (
                <option value={adjustment.revenueAccountStableId} disabled>
                  {isZh
                    ? '历史账户已不可用：'
                    : 'Historical account unavailable: '}
                  {adjustment.revenueAccountStableId}
                </option>
              ) : null}
              {accountOptions.map((account) => (
                <option
                  key={account.accountStableId}
                  value={account.accountStableId}
                >
                  {account.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                setAdjustments((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
              className="text-left text-sm font-medium text-red-700"
            >
              {isZh ? '删除调整' : 'Remove adjustment'}
            </button>
          </div>
        );
      })}
    </section>
  );
}

export function ExternalSaleTaxEditor({
  options,
  taxes,
  setTaxes,
  isZh,
}: {
  options: AccountingExternalSaleFormOptions;
  taxes: TaxDraft[];
  setTaxes: Dispatch<SetStateAction<TaxDraft[]>>;
  isZh: boolean;
}) {
  const updateTax = (index: number, patch: Partial<TaxDraft>) => {
    setTaxes((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{isZh ? '税' : 'Tax'}</h3>
        <button
          type="button"
          onClick={() =>
            setTaxes((current) => [
              ...current,
              { taxCode: 'HST', amount: '', rateBasisPoints: null },
            ])
          }
          className="rounded-lg border px-3 py-2 text-sm font-medium"
        >
          {isZh ? '添加税额' : 'Add tax'}
        </button>
      </div>
      {taxes.map((tax, index) => (
        <div
          key={index}
          className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-3"
        >
          <select
            value={tax.taxCode}
            onChange={(event) =>
              updateTax(index, {
                taxCode: event.target.value as 'HST' | 'ZERO_RATED',
                rateBasisPoints: null,
                ...(event.target.value === 'ZERO_RATED'
                  ? { amount: '0' }
                  : {}),
              })
            }
            className="rounded-lg border bg-white px-3 py-2"
          >
            {!options.sale.taxOptions.some(
              (option) => option.taxCode === tax.taxCode,
            ) ? (
              <option value={tax.taxCode} disabled>
                {isZh
                  ? '历史税账户当前不可用：'
                  : 'Historical tax account unavailable: '}
                {tax.taxCode}
              </option>
            ) : null}
            {options.sale.taxOptions.map((option) => (
              <option key={option.taxCode} value={option.taxCode}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={tax.amount}
            disabled={tax.taxCode === 'ZERO_RATED'}
            onChange={(event) =>
              updateTax(index, { amount: event.target.value })
            }
            inputMode="decimal"
            placeholder={isZh ? '税额 CAD' : 'Tax amount CAD'}
            className="rounded-lg border px-3 py-2 disabled:bg-slate-100"
          />
          <button
            type="button"
            onClick={() =>
              setTaxes((current) =>
                current.filter((_, itemIndex) => itemIndex !== index),
              )
            }
            className="text-left text-sm font-medium text-red-700"
          >
            {isZh ? '删除税额' : 'Remove tax'}
          </button>
        </div>
      ))}
    </section>
  );
}
