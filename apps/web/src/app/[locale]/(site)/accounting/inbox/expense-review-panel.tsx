'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiFetch } from '@/lib/api/client';
import { AccountingEvidenceViewer } from '../accounting-evidence-viewer';
import {
  ExpensePaymentAllocationsEditor,
  expensePaymentAllocationErrorMessage,
  makeExpensePaymentAllocationDraft,
  prepareExpensePaymentAllocations,
  type ExpensePaymentAllocationDraft,
} from '../expense-payment-allocations';
import type { AccountingAccount, AccountingCategory } from '../contracts/chart';
import type {
  AccountingInboxItem,
  AccountingManualUploadPermanentDeleteResult,
} from '../contracts/inbox';
import {
  type AccountingExpenseReviewRow,
  latestParse,
  makeReviewKey,
  money,
  reconciledTextractLineItemHints,
  toCents,
  toDollars,
} from './inbox-model';

type Props = {
  item: AccountingInboxItem;
  categories: AccountingCategory[];
  accounts: AccountingAccount[];
  isZh: boolean;
  onClose: () => void;
  onConfirmed: (item: AccountingInboxItem) => Promise<void>;
  canPermanentDelete: boolean;
  onEvidenceDeleted: (
    result: AccountingManualUploadPermanentDeleteResult,
  ) => Promise<void>;
};

type QuickTaxMode = 'EXEMPT' | 'HST13';

type QuickRow = {
  key: string;
  amount: string;
  categoryStableId: string;
  taxMode: QuickTaxMode;
  description: string | null;
  recognitionHint: boolean;
};

function recognizedForeignCurrencyCode(
  extraction: ReturnType<typeof latestParse>,
): string | null {
  const candidates = [
    extraction.sourceCurrency?.toUpperCase() ?? null,
    extraction.textractEvidence?.currencySuggestion?.code?.toUpperCase() ?? null,
  ];
  return (
    candidates.find((currency) => currency !== null && currency !== 'CAD') ?? null
  );
}

function hasUnsafeCurrencyEvidence(
  extraction: ReturnType<typeof latestParse>,
): boolean {
  return (
    extraction.sourceCurrencyEvidence === 'AMBIGUOUS' ||
    extraction.textractEvidence?.currencySuggestion?.ambiguous === true ||
    recognizedForeignCurrencyCode(extraction) !== null
  );
}

function correctionFieldLabel(field: string, isZh: boolean): string {
  switch (field) {
    case 'date':
      return isZh ? '日期' : 'date';
    case 'sourceCurrency':
      return isZh ? '原始币种' : 'source currency';
    case 'subtotalCents':
      return isZh ? '税前金额' : 'subtotal';
    case 'taxCents':
      return isZh ? 'HST' : 'tax';
    case 'totalCents':
      return isZh ? '总额' : 'total';
    case 'categoryStableId':
      return isZh ? '费用分类' : 'category';
    default:
      return field;
  }
}

export function AccountingInboxExpenseReviewPanel({
  item,
  categories,
  accounts,
  isZh,
  onClose,
  onConfirmed,
  canPermanentDelete,
  onEvidenceDeleted,
}: Props) {
  const [date, setDate] = useState('');
  const [total, setTotal] = useState('');
  const [sourceCurrency, setSourceCurrency] = useState('');
  const [paymentAllocations, setPaymentAllocations] = useState<
    ExpensePaymentAllocationDraft[]
  >(() => [makeExpensePaymentAllocationDraft()]);
  const [memo, setMemo] = useState('');
  const [rows, setRows] = useState<AccountingExpenseReviewRow[]>([]);
  const [quickRows, setQuickRows] = useState<QuickRow[]>([]);
  const [showQuick, setShowQuick] = useState(false);
  const quickAmountInputs = useRef(new Map<string, HTMLInputElement>());
  const pendingQuickAmountFocus = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expenseCategories = useMemo(() => {
    const parentStableIds = new Set(
      categories
        .map((category) => category.parentStableId)
        .filter((value): value is string => Boolean(value)),
    );
    return categories.filter(
      (category) =>
        category.type === 'EXPENSE' &&
        !parentStableIds.has(category.categoryStableId),
    );
  }, [categories]);
  const categoryNames = useMemo(
    () =>
      new Map(
        categories.map((category) => [category.categoryStableId, category.name]),
      ),
    [categories],
  );
  useEffect(() => {
    const extraction = latestParse(item);
    const suggested = extraction.suggestedCategoryStableId;
    const defaultCategory =
      (suggested &&
      expenseCategories.some(
        (category) => category.categoryStableId === suggested,
      )
        ? suggested
        : null) ??
      expenseCategories[0]?.categoryStableId ??
      '';
    const subtotalCents =
      extraction.subtotalCents ?? extraction.totalCents ?? 0;
    const taxCents = extraction.taxCents ?? 0;
    const recognizedLineItemHints = reconciledTextractLineItemHints(extraction);

    setDate(extraction.date ?? '');
    setSourceCurrency('CAD');
    setTotal(
      extraction.totalCents != null
        ? toDollars(extraction.totalCents)
        : '',
    );
    setPaymentAllocations([makeExpensePaymentAllocationDraft()]);
    setMemo('');
    setRows([
      {
        key: makeReviewKey(),
        categoryStableId: defaultCategory,
        amount:
          extraction.subtotalCents != null || extraction.totalCents != null
            ? toDollars(subtotalCents)
            : '',
        tax: extraction.taxCents != null ? toDollars(taxCents) : '',
      },
    ]);
    setQuickRows(
      recognizedLineItemHints.map((hint) => ({
        key: makeReviewKey(),
        amount: toDollars(hint.priceCents),
        categoryStableId: defaultCategory,
        taxMode: 'EXEMPT' as const,
        description: hint.description,
        recognitionHint: true,
      })),
    );
    setShowQuick(recognizedLineItemHints.length > 0);
    setError(null);
  }, [expenseCategories, item]);

  useEffect(() => {
    const key = pendingQuickAmountFocus.current;
    if (!key) return;
    const input = quickAmountInputs.current.get(key);
    if (!input) return;
    pendingQuickAmountFocus.current = null;
    input.focus();
    input.select();
  }, [quickRows]);

  const calculated = useMemo(() => {
    const subtotalCents = rows.reduce(
      (sum, row) => sum + toCents(row.amount),
      0,
    );
    const taxCents = rows.reduce((sum, row) => sum + toCents(row.tax), 0);
    const totalCents = toCents(total);
    return {
      subtotalCents,
      taxCents,
      totalCents,
      differenceCents: totalCents - subtotalCents - taxCents,
    };
  }, [rows, total]);
  const extraction = latestParse(item);
  const recognitionConsistency =
    extraction.textractEvidence?.financialConsistency === 'MISMATCH'
      ? 'MISMATCH'
      : (extraction.financialConsistency ??
        extraction.textractEvidence?.financialConsistency ??
        'INSUFFICIENT');
  const normalizedSourceCurrency = sourceCurrency.trim().toUpperCase();
  const bookingCorrectedFields = useMemo(() => {
    const corrected: string[] = [];
    const machineSourceCurrency = extraction.sourceCurrency?.toUpperCase() ?? null;
    const comparableAmountCurrency =
      machineSourceCurrency || normalizedSourceCurrency || 'CAD';

    if (extraction.date && date && extraction.date !== date) {
      corrected.push('date');
    }
    if (
      machineSourceCurrency &&
      normalizedSourceCurrency &&
      machineSourceCurrency !== normalizedSourceCurrency
    ) {
      corrected.push('sourceCurrency');
    }
    if (comparableAmountCurrency === 'CAD') {
      if (
        extraction.subtotalCents != null &&
        extraction.subtotalCents !== calculated.subtotalCents
      ) {
        corrected.push('subtotalCents');
      }
      if (
        extraction.taxCents != null &&
        extraction.taxCents !== calculated.taxCents
      ) {
        corrected.push('taxCents');
      }
      if (
        extraction.totalCents != null &&
        extraction.totalCents !== calculated.totalCents
      ) {
        corrected.push('totalCents');
      }
    }

    const reviewedCategoryStableIds = Array.from(
      new Set(
        rows
          .filter((row) => toCents(row.amount) > 0 || toCents(row.tax) > 0)
          .map((row) => row.categoryStableId),
      ),
    );
    if (
      extraction.suggestedCategoryStableId &&
      (reviewedCategoryStableIds.length !== 1 ||
        reviewedCategoryStableIds[0] !== extraction.suggestedCategoryStableId)
    ) {
      corrected.push('categoryStableId');
    }

    return corrected;
  }, [
    calculated.subtotalCents,
    calculated.taxCents,
    calculated.totalCents,
    date,
    extraction.date,
    extraction.sourceCurrency,
    extraction.subtotalCents,
    extraction.suggestedCategoryStableId,
    extraction.taxCents,
    extraction.totalCents,
    normalizedSourceCurrency,
    rows,
  ]);
  const hasRecognizedQuickRows = quickRows.some((row) => row.recognitionHint);
  const recognizedForeignCurrency = recognizedForeignCurrencyCode(extraction);
  const unsafeCurrencyEvidence = hasUnsafeCurrencyEvidence(extraction);
  const canAggregateRecognizedQuickRows =
    !hasRecognizedQuickRows ||
    (sourceCurrency.trim().toUpperCase() === 'CAD' && !unsafeCurrencyEvidence);

  function addQuickRow(options?: {
    focusAmount?: boolean;
    inheritFrom?: QuickRow;
  }) {
    const inheritFrom = options?.inheritFrom ?? quickRows.at(-1);
    const nextRow: QuickRow = {
      key: makeReviewKey(),
      amount: '',
      categoryStableId:
        inheritFrom?.categoryStableId ||
        rows.at(-1)?.categoryStableId ||
        expenseCategories[0]?.categoryStableId ||
        '',
      taxMode: inheritFrom?.taxMode ?? 'EXEMPT',
      description: null,
      recognitionHint: false,
    };
    if (options?.focusAmount) {
      pendingQuickAmountFocus.current = nextRow.key;
    }
    setQuickRows((current) => [...current, nextRow]);
  }

  function handleQuickAmountKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
    row: QuickRow,
    index: number,
  ) {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const nextRow = quickRows[index + 1];
    if (nextRow) {
      const nextInput = quickAmountInputs.current.get(nextRow.key);
      nextInput?.focus();
      nextInput?.select();
      return;
    }

    if (!toCents(row.amount)) return;
    addQuickRow({ focusAmount: true, inheritFrom: row });
  }

  function aggregateQuickRows() {
    if (!canAggregateRecognizedQuickRows) {
      setError(
        unsafeCurrencyEvidence
          ? isZh
            ? '识别结果提示非 CAD 或存在币种冲突，不能直接把识别条目汇总为 CAD。请按实际 CAD 金额手动归类。'
            : 'Recognition indicates a non-CAD or conflicting currency, so detected line amounts cannot be aggregated directly into CAD. Classify the actual CAD amounts manually.'
          : isZh
            ? '识别条目金额来自原始凭证。请先确认原始币种为 CAD，再汇总到 CAD 费用分类。'
            : 'Recognized item amounts come from the source document. Confirm the source currency is CAD before aggregating them into CAD expense categories.',
      );
      return;
    }
    const grouped = new Map<string, { amountCents: number; taxCents: number }>();
    for (const row of quickRows) {
      const amountCents = toCents(row.amount);
      if (!amountCents || !row.categoryStableId) continue;
      const taxCents = row.taxMode === 'HST13' ? Math.round(amountCents * 0.13) : 0;
      const existing = grouped.get(row.categoryStableId) ?? {
        amountCents: 0,
        taxCents: 0,
      };
      existing.amountCents += amountCents;
      existing.taxCents += taxCents;
      grouped.set(row.categoryStableId, existing);
    }
    if (!grouped.size) return;
    setRows(
      Array.from(grouped.entries()).map(([categoryStableId, value]) => ({
        key: makeReviewKey(),
        categoryStableId,
        amount: toDollars(value.amountCents),
        tax: toDollars(value.taxCents),
      })),
    );
    setShowQuick(false);
  }

  async function confirmExpense() {
    if (!date) {
      setError(isZh ? '请确认费用日期。' : 'Confirm the expense date.');
      return;
    }
    if (calculated.totalCents <= 0 || calculated.differenceCents !== 0) {
      setError(
        isZh
          ? `CAD 记账金额未对平，当前差额 ${money(calculated.differenceCents)}。`
          : `The CAD booking amount is not balanced. Difference: ${money(calculated.differenceCents)}.`,
      );
      return;
    }
    const preparedPaymentAllocations = prepareExpensePaymentAllocations(
      paymentAllocations,
      calculated.totalCents,
    );
    if (preparedPaymentAllocations.error) {
      setError(
        expensePaymentAllocationErrorMessage(
          preparedPaymentAllocations.error,
          isZh,
        ),
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(
        `/accounting/inbox/${item.inboxItemStableId}/expense/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            occurredAt: date,
            totalCents: calculated.totalCents,
            sourceCurrency: sourceCurrency.trim().toUpperCase() || null,
            paymentAllocations: preparedPaymentAllocations.paymentAllocations,
            attachmentUrls: [],
            memo: memo.trim() || null,
            splits: rows
              .filter(
                (row) => toCents(row.amount) > 0 || toCents(row.tax) > 0,
              )
              .map((row) => ({
                categoryStableId: row.categoryStableId,
                amountCents: toCents(row.amount),
                taxCents: toCents(row.tax),
              })),
          }),
        },
      );
      await onConfirmed(item);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  const sourceCurrencyEvidence = extraction.sourceCurrencyEvidence ?? 'UNKNOWN';
  const sourceSubtotalCents = extraction.subtotalCents ?? null;
  const sourceTaxCents = extraction.taxCents ?? null;
  const sourceTotalCents = extraction.totalCents ?? null;
  const textractCurrencySuggestion =
    extraction.textractEvidence?.currencySuggestion?.code ?? null;
  const textractCurrencyConfidence =
    extraction.textractEvidence?.currencySuggestion?.confidence ?? null;
  const textractCurrencyLabel = textractCurrencySuggestion
    ? `${textractCurrencySuggestion}${
        textractCurrencyConfidence == null
          ? ''
          : ` (${textractCurrencyConfidence.toFixed(1)}%)`
      }`
    : null;
  const sourceAmountCurrencyLabel =
    (recognizedForeignCurrency ?? normalizedSourceCurrency) || '?';
  const ambiguousCurrencyEvidence =
    sourceCurrencyEvidence === 'AMBIGUOUS' ||
    extraction.textractEvidence?.currencySuggestion?.ambiguous === true;
  const foreignCurrencyWarning =
    recognizedForeignCurrency ??
    (normalizedSourceCurrency && normalizedSourceCurrency !== 'CAD'
      ? normalizedSourceCurrency
      : null);
  const showCurrencyWarning =
    ambiguousCurrencyEvidence || foreignCurrencyWarning !== null;
  const evidence = item.artifact.storedUrl
    ? {
        artifactStableId: item.artifact.artifactStableId,
        filename: item.artifact.originalFilename,
        kind: item.artifact.kind,
        deletion:
          item.artifact.acquisitionMode === 'MANUAL_UPLOAD'
            ? {
                inboxItemStableId: item.inboxItemStableId,
                canPermanentDelete,
              }
            : null,
      }
    : null;

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {isZh ? '按费用处理' : 'Review as expense'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {item.artifact.emailSubject ||
              item.artifact.originalFilename ||
              item.inboxItemStableId}
          </p>
        </div>
        <button className="text-sm text-slate-600" onClick={onClose}>
          {isZh ? '关闭' : 'Close'}
        </button>
      </div>
      <p className="mt-3 rounded bg-white px-3 py-2 text-xs text-amber-800">
        {isZh
          ? '只有确认这是普通费用凭证时才继续。Clover / Uber Eats / Fantuan 对账单、Closeout 或平台财务文件请留在收件箱，等待平台财务解析。'
          : 'Continue only for ordinary expense evidence. Leave Clover / Uber Eats / Fantuan statements, closeouts, and platform financial files in Inbox for provider parsing.'}
      </p>
      {extraction.extractedText || item.artifact.bodyText ? (
        <details className="mt-4 rounded-lg border bg-white p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {isZh ? '查看识别原文' : 'View extracted text'}
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-xs text-slate-600">
            {extraction.extractedText ?? item.artifact.bodyText}
          </pre>
        </details>
      ) : null}
      <div
        className={`mt-4 rounded-lg border p-3 text-sm ${
          recognitionConsistency === 'MISMATCH'
            ? 'border-red-300 bg-red-50'
            : recognitionConsistency === 'MATCHED'
              ? 'border-emerald-200 bg-emerald-50/50'
              : 'bg-white'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>{isZh ? '机器识别结果' : 'Machine extraction'}</strong>
          <span
            className={`rounded px-2 py-1 text-xs font-medium ${
              recognitionConsistency === 'MISMATCH'
                ? 'bg-red-100 text-red-700'
                : recognitionConsistency === 'MATCHED'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
            }`}
          >
            {recognitionConsistency === 'MATCHED'
              ? isZh
                ? '金额已自洽'
                : 'Amounts reconcile'
              : recognitionConsistency === 'MISMATCH'
                ? isZh
                  ? '金额不自洽 · 需人工订正'
                  : 'Amount mismatch · correction required'
                : isZh
                  ? '金额证据不足 · 请核对'
                  : 'Insufficient amount evidence · verify'}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {isZh ? '识别引擎' : 'Recognition engine'}:{' '}
          {extraction.textRecognitionEngine ?? extraction.ocrEngine ?? '—'} ·{' '}
          {isZh ? '日期' : 'Date'}: {extraction.date ?? '—'} ·{' '}
          {isZh ? '建议分类' : 'Suggested category'}:{' '}
          {extraction.suggestedCategoryName ?? '—'}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div>
            <span className="text-slate-500">{isZh ? '税前' : 'Subtotal'}</span>
            <strong className="ml-2">
              {sourceSubtotalCents == null
                ? '-'
                : `${sourceAmountCurrencyLabel} ${money(sourceSubtotalCents)}`}
            </strong>
          </div>
          <div>
            <span className="text-slate-500">{isZh ? '税' : 'Tax'}</span>
            <strong className="ml-2">
              {sourceTaxCents == null
                ? '-'
                : `${sourceAmountCurrencyLabel} ${money(sourceTaxCents)}`}
            </strong>
          </div>
          <div>
            <span className="text-slate-500">{isZh ? '总额' : 'Total'}</span>
            <strong className="ml-2">
              {sourceTotalCents == null
                ? '-'
                : `${sourceAmountCurrencyLabel} ${money(sourceTotalCents)}`}
            </strong>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {sourceCurrencyEvidence === 'EXPLICIT_TEXT'
            ? isZh
              ? '凭证正文识别到明确币种；编辑币种仍默认 CAD，识别结果仅作人工录入参考。'
              : 'The document contains explicit currency evidence; the editor still defaults to CAD and uses recognition only as an entry aid.'
            : sourceCurrencyEvidence === 'AMBIGUOUS'
              ? isZh
                ? '凭证中出现多个币种；编辑币种仍默认 CAD，请结合下方提示人工核对。'
                : 'Multiple currencies were detected; the editor still defaults to CAD, so verify the warning below manually.'
              : isZh
                ? '凭证正文未明确币种；编辑币种默认 CAD。'
                : 'The document text did not state a currency; the editor defaults to CAD.'}
        </p>
        {recognitionConsistency === 'MISMATCH' ? (
          <p className="mt-2 rounded bg-red-100 px-3 py-2 text-xs font-medium text-red-700">
            {isZh
              ? '系统/AWS 提取的税前、税额和总额无法自洽。当前机器值仅作为识别证据；请根据原始凭证，在下方“最终入账值”中直接修正。'
              : 'System/AWS subtotal, tax, and total do not reconcile. Machine values remain recognition evidence only; correct the editable Final booking values below from the source document.'}
          </p>
        ) : null}
        {textractCurrencySuggestion ? (
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? `AWS Textract 币种建议：${textractCurrencySuggestion}${textractCurrencyConfidence == null ? '' : `（${textractCurrencyConfidence.toFixed(1)}%）`}。仅作人工录入参考；币种编辑框仍默认 CAD，识别到的总额仍会预填，非 CAD 时在下方红字提醒核对。`
              : `AWS Textract currency suggestion: ${textractCurrencySuggestion}${textractCurrencyConfidence == null ? '' : ` (${textractCurrencyConfidence.toFixed(1)}%)`}. This is an entry aid only: the currency field still defaults to CAD, detected totals are still prefilled, and non-CAD evidence is flagged below for review.`}
          </p>
        ) : null}
      </div>
      <section className="mt-4 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
        <strong className="text-sm">
          {isZh ? '最终入账值（可编辑）' : 'Final booking values (editable)'}
        </strong>
        <p className="mt-1 text-xs text-slate-600">
          {isZh
            ? '上方机器识别结果保持只读。请在这里按原始凭证修正日期、币种、总额、分类、税前金额和 HST；确认创建费用时，系统会自动保存机器值、最终值和订正字段。'
            : 'Machine extraction above remains read-only. Correct date, currency, total, category, subtotal, and HST here from the source document; confirmation automatically records machine values, final values, and corrected fields.'}
        </p>
        {bookingCorrectedFields.length ? (
          <p className="mt-2 rounded bg-white px-3 py-2 text-xs font-medium text-blue-800">
            {isZh ? '已人工订正：' : 'Manually corrected: '}
            {bookingCorrectedFields
              .map((field) => correctionFieldLabel(field, isZh))
              .join(isZh ? '、' : ', ')}
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            {isZh
              ? '当前最终入账值尚未偏离机器已识别字段。'
              : 'Final booking values currently match the machine-observed fields.'}
          </p>
        )}
      </section>
      <div className="mt-3 grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? '原始币种' : 'Source currency'}
          </span>
          <input
            className="w-full rounded border bg-white px-3 py-2 uppercase"
            maxLength={3}
            value={sourceCurrency}
            onChange={(event) => {
              setSourceCurrency(event.target.value.toUpperCase());
              setError(null);
            }}
          />
          {showCurrencyWarning ? (
            <span className="mt-1 block text-xs text-red-600">
              {recognizedForeignCurrency
                ? isZh
                  ? `识别结果提示原始币种为 ${recognizedForeignCurrency}。币种输入框仍默认 CAD，账单总额已按识别值预填，请人工核对并按实际记账需要修改。`
                  : `Recognition suggests ${recognizedForeignCurrency}. The currency field still defaults to CAD and the detected total has been prefilled; verify and adjust it for the actual booking as needed.`
                : ambiguousCurrencyEvidence
                  ? isZh
                    ? '识别结果包含多个或冲突币种。币种输入框仍默认 CAD，识别总额仍会预填，请人工核对后修正。'
                    : 'Recognition found multiple or conflicting currencies. The currency field still defaults to CAD and the detected total is still prefilled; verify and correct it manually.'
                  : isZh
                    ? `当前币种输入为 ${foreignCurrencyWarning}。识别总额仅作预填参考，请按实际记账需要核对。`
                    : `The currency field is currently ${foreignCurrencyWarning}. The detected total is only a prefill aid; verify it for the actual booking.`}
            </span>
          ) : null}
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? '费用日期' : 'Expense date'}
          </span>
          <input
            className="w-full rounded border bg-white px-3 py-2"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? 'CAD 实际记账总额' : 'Actual CAD booking total'}
          </span>
          <div className="flex rounded border bg-white px-3 py-2">
            <span>CAD $</span>
            <input
              className="ml-1 min-w-0 flex-1 outline-none"
              value={total}
              inputMode="decimal"
              onChange={(event) => setTotal(event.target.value)}
            />
          </div>
        </label>
      </div>
      <section className="mt-4 rounded-lg border border-amber-200 bg-amber-100/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong className="text-sm">
              {isZh ? '快速归类计算器' : 'Quick classify calculator'}
            </strong>
            <p className="mt-1 text-xs text-slate-600">
              {isZh
                ? 'Textract 条目与税前金额可靠闭合时会自动预填原始凭证金额；确认原始币种为 CAD 后可直接归类。手工新增时，金额后按 Enter 可继续下一项并继承上一项类别/税率。最终只保存类别汇总。'
                : 'When Textract item amounts reliably reconcile to the subtotal, source-document amounts are prefilled automatically. Confirm the source currency is CAD before aggregating them. Manual rows keep the Enter-to-next category/tax workflow; only category totals are persisted.'}
            </p>
          </div>
          <button
            type="button"
            className="rounded border bg-white px-3 py-1.5 text-sm"
            onClick={() => {
              setShowQuick((value) => !value);
              if (!quickRows.length) addQuickRow();
            }}
          >
            {showQuick
              ? isZh
                ? '收起'
                : 'Hide'
              : isZh
                ? '逐项录入'
                : 'Enter items'}
          </button>
        </div>
        {showQuick ? (
          <div className="mt-3 space-y-2">
            {hasRecognizedQuickRows ? (
              <p className="rounded bg-white/80 px-3 py-2 text-xs text-slate-600">
                {canAggregateRecognizedQuickRows
                  ? isZh
                    ? '已按 Textract 识别结果预填条目金额，并确认原始币种为 CAD；可直接调整类别/税率后汇总。'
                    : 'Textract item amounts are prefilled and the source currency is confirmed as CAD. Review category/tax choices, then aggregate.'
                  : isZh
                    ? '已预填 Textract 识别的原始凭证条目金额。请先在上方确认原始币种为 CAD；在此之前不会把这些原币金额汇总成 CAD 费用。'
                    : 'Textract source-document item amounts are prefilled. Confirm the source currency is CAD above before these source amounts can be aggregated into CAD expenses.'}
              </p>
            ) : null}
            {quickRows.map((row, index) => (
              <div
                key={row.key}
                className="grid gap-2 md:grid-cols-[180px_1fr_130px_70px]"
              >
                <div className="min-w-0">
                  {row.recognitionHint ? (
                    <p
                      className="mb-1 truncate text-xs text-slate-500"
                      title={row.description ?? undefined}
                    >
                      {row.description ||
                        (isZh ? `识别条目 ${index + 1}` : `Detected item ${index + 1}`)}
                    </p>
                  ) : null}
                  <input
                    ref={(node) => {
                      if (node) quickAmountInputs.current.set(row.key, node);
                      else quickAmountInputs.current.delete(row.key);
                    }}
                    className="w-full rounded border bg-white px-3 py-2 text-sm"
                    inputMode="decimal"
                    enterKeyHint="next"
                    placeholder={
                      row.recognitionHint
                        ? `${sourceCurrency || '?'} 0.00`
                        : 'CAD 0.00'
                    }
                    value={row.amount}
                    onChange={(event) =>
                      setQuickRows((current) =>
                        current.map((entry) =>
                          entry.key === row.key
                            ? { ...entry, amount: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    onKeyDown={(event) =>
                      handleQuickAmountKeyDown(event, row, index)
                    }
                  />
                </div>
                <select
                  className="rounded border bg-white px-3 py-2 text-sm"
                  value={row.categoryStableId}
                  onChange={(event) =>
                    setQuickRows((current) =>
                      current.map((entry) =>
                        entry.key === row.key
                          ? { ...entry, categoryStableId: event.target.value }
                          : entry,
                      ),
                    )
                  }
                >
                  {expenseCategories.map((category) => (
                    <option
                      key={category.categoryStableId}
                      value={category.categoryStableId}
                    >
                      {categoryNames.get(category.parentStableId ?? '')
                        ? `${categoryNames.get(category.parentStableId ?? '')} › `
                        : ''}
                      {category.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded border bg-white px-3 py-2 text-sm"
                  value={row.taxMode}
                  onChange={(event) =>
                    setQuickRows((current) =>
                      current.map((entry) =>
                        entry.key === row.key
                          ? { ...entry, taxMode: event.target.value as QuickTaxMode }
                          : entry,
                      ),
                    )
                  }
                >
                  <option value="EXEMPT">{isZh ? '免税' : 'Tax exempt'}</option>
                  <option value="HST13">HST 13%</option>
                </select>
                <button
                  type="button"
                  className="text-sm text-red-600"
                  disabled={quickRows.length <= 1}
                  onClick={() =>
                    setQuickRows((current) =>
                      current.filter((entry) => entry.key !== row.key),
                    )
                  }
                >
                  {isZh ? '删除' : 'Remove'}
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addQuickRow()}
                className="rounded border bg-white px-3 py-1.5 text-sm"
              >
                + {isZh ? '下一项' : 'Next item'}
              </button>
              <button
                type="button"
                onClick={aggregateQuickRows}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
              >
                {isZh ? '汇总到费用分类' : 'Aggregate categories'}
              </button>
            </div>
          </div>
        ) : null}
      </section>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid gap-2 md:grid-cols-[1.6fr_140px_140px_70px] md:items-end"
          >
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">
                {isZh ? '类别' : 'Category'}
              </span>
              <select
                className="w-full rounded border bg-white px-3 py-2"
                value={row.categoryStableId}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((entry) =>
                      entry.key === row.key
                        ? { ...entry, categoryStableId: event.target.value }
                        : entry,
                    ),
                  )
                }
              >
                {expenseCategories.map((category) => (
                  <option
                    key={category.categoryStableId}
                    value={category.categoryStableId}
                  >
                    {categoryNames.get(category.parentStableId ?? '')
                      ? `${categoryNames.get(category.parentStableId ?? '')} › `
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
                value={row.amount}
                inputMode="decimal"
                onChange={(event) =>
                  setRows((current) =>
                    current.map((entry) =>
                      entry.key === row.key
                        ? { ...entry, amount: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">HST</span>
              <input
                className="w-full rounded border bg-white px-3 py-2"
                value={row.tax}
                inputMode="decimal"
                onChange={(event) =>
                  setRows((current) =>
                    current.map((entry) =>
                      entry.key === row.key
                        ? { ...entry, tax: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              disabled={rows.length <= 1}
              className="pb-2 text-sm text-red-600 disabled:text-slate-300"
              onClick={() =>
                setRows((current) =>
                  current.filter((entry) => entry.key !== row.key),
                )
              }
            >
              {isZh ? '删除' : 'Remove'}
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 rounded border bg-white px-3 py-1.5 text-sm"
        onClick={() =>
          setRows((current) => [
            ...current,
            {
              key: makeReviewKey(),
              categoryStableId:
                current.at(-1)?.categoryStableId ||
                expenseCategories[0]?.categoryStableId ||
                '',
              amount: '',
              tax: '',
            },
          ])
        }
      >
        + {isZh ? '增加类别' : 'Add category'}
      </button>
      <div className="mt-4">
        <ExpensePaymentAllocationsEditor
          accounts={accounts}
          totalCents={calculated.totalCents}
          allocations={paymentAllocations}
          onChange={setPaymentAllocations}
          isZh={isZh}
        />
      </div>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-slate-500">{isZh ? '备注' : 'Memo'}</span>
        <textarea
          className="min-h-20 w-full rounded border bg-white px-3 py-2"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
        />
      </label>
      <div className="mt-4 grid gap-3 rounded-lg bg-white p-3 text-sm sm:grid-cols-4">
        <div>
          <span className="text-slate-500">{isZh ? 'CAD 税前' : 'CAD subtotal'}</span>
          <strong className="ml-2">{money(calculated.subtotalCents)}</strong>
        </div>
        <div>
          <span className="text-slate-500">CAD HST</span>
          <strong className="ml-2">{money(calculated.taxCents)}</strong>
        </div>
        <div>
          <span className="text-slate-500">{isZh ? 'CAD 总额' : 'CAD total'}</span>
          <strong className="ml-2">{money(calculated.totalCents)}</strong>
        </div>
        <div>
          <span className="text-slate-500">{isZh ? '差额' : 'Difference'}</span>
          <strong
            className={`ml-2 ${calculated.differenceCents === 0 ? 'text-emerald-600' : 'text-amber-600'}`}
          >
            {money(calculated.differenceCents)}
          </strong>
        </div>
      </div>
      {error ? (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => void confirmExpense()}
          disabled={
            saving ||
            !date ||
            calculated.differenceCents !== 0 ||
            calculated.totalCents <= 0
          }
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving
            ? isZh
              ? '入账中…'
              : 'Posting…'
            : isZh
              ? '确认并创建费用'
              : 'Confirm and create expense'}
        </button>
        {evidence ? (
          <AccountingEvidenceViewer
            evidence={evidence}
            isZh={isZh}
            onDeleted={onEvidenceDeleted}
            label={isZh ? '查看凭证' : 'Open source'}
            className="rounded border bg-white px-4 py-2 text-sm text-blue-600"
          />
        ) : null}
      </div>
    </section>
  );
}
