'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { apiFetch, getApiErrorMessage } from '@/lib/api/client';
import type {
  AccountingExternalSaleDetail,
  AccountingExternalSaleFormOptions,
  AccountingExternalSaleWriteResult,
  CreateAccountingExternalSaleInput,
} from '../contracts/external-sales';
import {
  ExternalSaleAdjustmentEditor,
  ExternalSaleLineEditor,
  ExternalSaleTaxEditor,
  blankSaleLine,
  type AdjustmentDraft,
  type SaleLineDraft,
  type TaxDraft,
} from './external-sale-form-editors';
import {
  centsToDollars,
  dollarsToCents,
  localDateToday,
  newRequestId,
} from './external-sales-utils';

export function ExternalSaleCreateForm({
  options,
  prefill,
  isZh,
  onSaved,
  onCancelPrefill,
}: {
  options: AccountingExternalSaleFormOptions;
  prefill: AccountingExternalSaleDetail | null;
  isZh: boolean;
  onSaved: (externalSaleStableId: string) => void;
  onCancelPrefill: () => void;
}) {
  const [classificationStableId, setClassificationStableId] = useState('');
  const [granularity, setGranularity] = useState<
    'TRANSACTION' | 'DAILY_SUMMARY' | 'PERIOD_SUMMARY'
  >('TRANSACTION');
  const [occurredOn, setOccurredOn] = useState(localDateToday());
  const [periodStartOn, setPeriodStartOn] = useState('');
  const [periodEndOn, setPeriodEndOn] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<SaleLineDraft[]>([blankSaleLine(options)]);
  const [adjustments, setAdjustments] = useState<AdjustmentDraft[]>([]);
  const [taxes, setTaxes] = useState<TaxDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setClassificationStableId(prefill.classificationStableId);
    setGranularity(prefill.granularity);
    setOccurredOn(prefill.occurredOn);
    setPeriodStartOn(prefill.periodStartOn ?? '');
    setPeriodEndOn(prefill.periodEndOn ?? '');
    setCounterpartyName(prefill.counterpartyName);
    setReference(prefill.reference ?? '');
    setNote(prefill.note ?? '');
    setLines(
      prefill.lines.map((line) => ({
        description: line.description,
        productReference: line.productReference ?? '',
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: centsToDollars(line.unitPriceCents),
        lineAmount: centsToDollars(line.lineAmountCents),
        revenueAccountStableId: line.revenueAccountStableId,
      })),
    );
    setAdjustments(
      prefill.adjustments.map((adjustment) => ({
        label: adjustment.label,
        amount: centsToDollars(adjustment.amountCents),
        revenueAccountStableId: adjustment.revenueAccountStableId,
      })),
    );
    setTaxes(
      prefill.taxes.map((tax) => ({
        taxCode: tax.taxCode === 'ZERO_RATED' ? 'ZERO_RATED' : 'HST',
        amount: centsToDollars(tax.amountCents),
        rateBasisPoints: tax.rateBasisPoints,
      })),
    );
    setFeedback(null);
  }, [prefill]);

  const replacementForExternalSaleStableId =
    prefill?.externalSaleStableId ?? null;

  const classificationSuggestions = useMemo(
    () =>
      options.classificationSuggestions.includes(classificationStableId)
        ? options.classificationSuggestions
        : classificationStableId
          ? [classificationStableId, ...options.classificationSuggestions]
          : options.classificationSuggestions,
    [classificationStableId, options.classificationSuggestions],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);

    const normalizedLines: CreateAccountingExternalSaleInput['lines'] = [];
    for (const line of lines) {
      const unitPriceCents = dollarsToCents(line.unitPrice);
      const lineAmountCents = dollarsToCents(line.lineAmount);
      const lineAccountAllowed = options.sale.lineRevenueAccounts.some(
        (account) =>
          account.accountStableId === line.revenueAccountStableId,
      );
      if (
        !line.description.trim() ||
        !line.quantity.trim() ||
        !line.unit.trim() ||
        !line.revenueAccountStableId ||
        !lineAccountAllowed ||
        unitPriceCents === null ||
        unitPriceCents < 0 ||
        lineAmountCents === null ||
        lineAmountCents <= 0
      ) {
        setFeedback(
          isZh
            ? '请完整填写每条销售明细；金额必须是有效的 CAD 金额。'
            : 'Complete every sale line with valid CAD amounts.',
        );
        return;
      }
      normalizedLines.push({
        description: line.description.trim(),
        productReference: line.productReference.trim() || null,
        quantity: line.quantity.trim(),
        unit: line.unit.trim(),
        unitPriceCents,
        lineAmountCents,
        revenueAccountStableId: line.revenueAccountStableId,
      });
    }

    const normalizedAdjustments: NonNullable<
      CreateAccountingExternalSaleInput['adjustments']
    > = [];
    for (const adjustment of adjustments) {
      const amountCents = dollarsToCents(adjustment.amount);
      const adjustmentAccountOptions =
        amountCents !== null && amountCents < 0
          ? options.sale.negativeAdjustmentAccounts
          : options.sale.positiveAdjustmentAccounts;
      const adjustmentAccountAllowed = adjustmentAccountOptions.some(
        (account) =>
          account.accountStableId === adjustment.revenueAccountStableId,
      );
      if (
        !adjustment.label.trim() ||
        amountCents === null ||
        amountCents === 0 ||
        !adjustment.revenueAccountStableId ||
        !adjustmentAccountAllowed
      ) {
        setFeedback(
          isZh
            ? '调整项目必须填写说明、非零金额和账户。'
            : 'Adjustments require a label, non-zero amount and account.',
        );
        return;
      }
      normalizedAdjustments.push({
        label: adjustment.label.trim(),
        amountCents,
        revenueAccountStableId: adjustment.revenueAccountStableId,
      });
    }

    const normalizedTaxes: NonNullable<
      CreateAccountingExternalSaleInput['taxes']
    > = [];
    for (const tax of taxes) {
      const amountCents = dollarsToCents(tax.amount);
      const taxOption = options.sale.taxOptions.find(
        (option) => option.taxCode === tax.taxCode,
      );
      if (amountCents === null || amountCents < 0 || !taxOption) {
        setFeedback(
          isZh ? '税额不是有效金额。' : 'Tax amount is not valid.',
        );
        return;
      }
      normalizedTaxes.push({
        taxCode: tax.taxCode,
        label: taxOption.label,
        rateBasisPoints: tax.rateBasisPoints,
        amountCents,
        liabilityAccountStableId: taxOption.liabilityAccountStableId,
      });
    }

    if (
      !classificationStableId.trim() ||
      !counterpartyName.trim() ||
      !occurredOn
    ) {
      setFeedback(
        isZh
          ? '分类、交易对方和发生日期为必填项。'
          : 'Classification, counterparty and occurred date are required.',
      );
      return;
    }
    if (
      granularity === 'PERIOD_SUMMARY' &&
      (!periodStartOn || !periodEndOn)
    ) {
      setFeedback(
        isZh
          ? '期间汇总必须填写开始和结束日期。'
          : 'Period summaries require start and end dates.',
      );
      return;
    }

    const body: CreateAccountingExternalSaleInput = {
      requestId: newRequestId(),
      storeStableId: options.store.storeStableId,
      classificationStableId: classificationStableId.trim(),
      granularity,
      occurredOn,
      periodStartOn:
        granularity === 'PERIOD_SUMMARY' ? periodStartOn : null,
      periodEndOn: granularity === 'PERIOD_SUMMARY' ? periodEndOn : null,
      counterpartyName: counterpartyName.trim(),
      reference: reference.trim() || null,
      currency: 'CAD',
      replacementForExternalSaleStableId,
      lines: normalizedLines,
      adjustments: normalizedAdjustments,
      taxes: normalizedTaxes,
      note: note.trim() || null,
    };

    setBusy(true);
    try {
      const created = await apiFetch<AccountingExternalSaleWriteResult>(
        '/accounting/external-sales',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      setFeedback(
        isZh
          ? '外部销售已按 canonical Accounting 权威入账。'
          : 'External sale posted through canonical Accounting authority.',
      );
      onSaved(created.externalSaleStableId);
      if (replacementForExternalSaleStableId) onCancelPrefill();
    } catch (error) {
      setFeedback(
        getApiErrorMessage(
          error,
          isZh ? '外部销售入账失败。' : 'Failed to post external sale.',
        ),
      );
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
          {replacementForExternalSaleStableId
            ? isZh
              ? '创建订正替代销售'
              : 'Create corrected replacement sale'
            : isZh
              ? '录入外部销售'
              : 'Record external sale'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '金额、税额和账户会由后端 Accounting 权威再次校验；页面不自行生成 Journal。'
            : 'Accounting revalidates amounts, tax and accounts server-side. The browser never creates Journal entries.'}
        </p>
        {replacementForExternalSaleStableId ? (
          <CorrectionBanner
            stableId={replacementForExternalSaleStableId}
            isZh={isZh}
            onCancel={onCancelPrefill}
          />
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">
            {isZh ? '分类 Stable ID' : 'Classification stable ID'}
          </span>
          <input
            list="external-sale-classifications"
            value={classificationStableId}
            onChange={(event) => setClassificationStableId(event.target.value)}
            placeholder="external_wholesale"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
          <datalist id="external-sale-classifications">
            {classificationSuggestions.map((classification) => (
              <option key={classification} value={classification} />
            ))}
          </datalist>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">
            {isZh ? '证据粒度' : 'Evidence granularity'}
          </span>
          <select
            value={granularity}
            onChange={(event) =>
              setGranularity(
                event.target.value as
                  | 'TRANSACTION'
                  | 'DAILY_SUMMARY'
                  | 'PERIOD_SUMMARY',
              )
            }
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
          >
            <option value="TRANSACTION">
              {isZh ? '单笔交易' : 'Transaction'}
            </option>
            <option value="DAILY_SUMMARY">
              {isZh ? '每日汇总' : 'Daily summary'}
            </option>
            <option value="PERIOD_SUMMARY">
              {isZh ? '期间汇总' : 'Period summary'}
            </option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">
            {isZh ? '发生日期' : 'Occurred on'}
          </span>
          <input
            type="date"
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
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
        {granularity === 'PERIOD_SUMMARY' ? (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {isZh ? '期间开始' : 'Period start'}
              </span>
              <input
                type="date"
                value={periodStartOn}
                onChange={(event) => setPeriodStartOn(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {isZh ? '期间结束' : 'Period end'}
              </span>
              <input
                type="date"
                value={periodEndOn}
                onChange={(event) => setPeriodEndOn(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              />
            </label>
          </>
        ) : null}
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
        <label className="text-sm sm:col-span-2">
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

      <ExternalSaleLineEditor
        options={options}
        lines={lines}
        setLines={setLines}
        isZh={isZh}
      />
      <ExternalSaleAdjustmentEditor
        options={options}
        adjustments={adjustments}
        setAdjustments={setAdjustments}
        isZh={isZh}
      />
      <ExternalSaleTaxEditor
        options={options}
        taxes={taxes}
        setTaxes={setTaxes}
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
          : replacementForExternalSaleStableId
            ? isZh
              ? '确认创建替代销售'
              : 'Create replacement sale'
            : isZh
              ? '确认并入账'
              : 'Post external sale'}
      </button>
    </form>
  );
}

function CorrectionBanner({
  stableId,
  isZh,
  onCancel,
}: {
  stableId: string;
  isZh: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {isZh ? '替代前序：' : 'Replacing predecessor: '}
      <span className="break-all font-mono text-xs">{stableId}</span>
      <button
        type="button"
        onClick={onCancel}
        className="ml-3 font-semibold underline"
      >
        {isZh ? '取消订正' : 'Cancel correction'}
      </button>
    </div>
  );
}
