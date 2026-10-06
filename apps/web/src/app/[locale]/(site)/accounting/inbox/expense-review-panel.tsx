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
import type { AccountingAccount, AccountingCategory } from '../contracts/chart';
import type {
  AccountingInboxItem,
  AccountingManualUploadPermanentDeleteResult,
} from '../contracts/inbox';
import {
  type AccountingExpenseReviewRow,
  expenseReviewParse,
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
type ReviewTaxMode = AccountingExpenseReviewRow['taxMode'];

type QuickRow = {
  key: string;
  amount: string;
  categoryStableId: string;
  taxMode: QuickTaxMode;
  paidFromAccountStableId: string;
  description: string | null;
  recognitionHint: boolean;
};

function recognizedForeignCurrencyCode(
  extraction: ReturnType<typeof expenseReviewParse>,
): string | null {
  const candidates = [
    extraction.sourceCurrency?.toUpperCase() ?? null,
    extraction.textractEvidence?.currencySuggestion?.code?.toUpperCase() ?? null,
  ];
  return (
    candidates.find((currency) => currency !== null && currency !== 'CAD') ?? null
  );
}

function reviewTaxMode(
  amountCents: number,
  taxCents: number,
): ReviewTaxMode {
  if (taxCents === 0) return 'EXEMPT';
  if (taxCents === Math.round(amountCents * 0.13)) return 'HST13';
  return 'MANUAL';
}

function hasUnsafeCurrencyEvidence(
  extraction: ReturnType<typeof expenseReviewParse>,
): boolean {
  return (
    extraction.sourceCurrencyEvidence === 'AMBIGUOUS' ||
    extraction.textractEvidence?.currencySuggestion?.ambiguous === true ||
    recognizedForeignCurrencyCode(extraction) !== null
  );
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
    const extraction = expenseReviewParse(item);
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
    setMemo('');
    setRows([
      {
        key: makeReviewKey(),
        categoryStableId: defaultCategory,
        amount:
          extraction.subtotalCents != null || extraction.totalCents != null
            ? toDollars(subtotalCents)
            : '',
        taxMode: reviewTaxMode(subtotalCents, taxCents),
        tax: extraction.taxCents != null ? toDollars(taxCents) : '',
        paidFromAccountStableId: '',
      },
    ]);
    setQuickRows(
      recognizedLineItemHints.map((hint) => ({
        key: makeReviewKey(),
        amount: toDollars(hint.priceCents),
        categoryStableId: defaultCategory,
        taxMode: 'EXEMPT' as const,
        paidFromAccountStableId: '',
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
  const expenseBalanced =
    calculated.totalCents > 0 && calculated.differenceCents === 0;
  const missingFundingCount = rows.filter(
    (row) =>
      toCents(row.amount) + toCents(row.tax) > 0 &&
      !row.paidFromAccountStableId.trim(),
  ).length;
  const extraction = expenseReviewParse(item);
  const normalizedSourceCurrency = sourceCurrency.trim().toUpperCase();
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
      paidFromAccountStableId:
        inheritFrom?.paidFromAccountStableId ??
        rows.at(-1)?.paidFromAccountStableId ??
        '',
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
            ? '原始凭证存在非 CAD 或币种冲突，不能直接把预填条目汇总为 CAD。请按实际 CAD 入账金额手动归类。'
            : 'The source evidence has a non-CAD or conflicting currency, so prefilled rows cannot be aggregated directly into CAD. Classify the actual CAD booking amounts manually.'
          : isZh
            ? '预填条目来自原始凭证。请先确认原始币种为 CAD，再汇总到 CAD 费用分类。'
            : 'Prefilled rows come from the source document. Confirm the source currency is CAD before aggregating them into CAD expense categories.',
      );
      return;
    }
    const grouped = new Map<
      string,
      {
        categoryStableId: string;
        paidFromAccountStableId: string;
        amountCents: number;
        taxCents: number;
      }
    >();
    for (const row of quickRows) {
      const amountCents = toCents(row.amount);
      if (!amountCents || !row.categoryStableId) continue;
      const taxCents =
        row.taxMode === 'HST13' ? Math.round(amountCents * 0.13) : 0;
      const groupKey = JSON.stringify([
        row.categoryStableId,
        row.paidFromAccountStableId,
      ]);
      const existing = grouped.get(groupKey) ?? {
        categoryStableId: row.categoryStableId,
        paidFromAccountStableId: row.paidFromAccountStableId,
        amountCents: 0,
        taxCents: 0,
      };
      existing.amountCents += amountCents;
      existing.taxCents += taxCents;
      grouped.set(groupKey, existing);
    }
    if (!grouped.size) return;
    setRows(
      Array.from(grouped.values()).map((value) => ({
        key: makeReviewKey(),
        categoryStableId: value.categoryStableId,
        amount: toDollars(value.amountCents),
        taxMode: reviewTaxMode(value.amountCents, value.taxCents),
        tax: toDollars(value.taxCents),
        paidFromAccountStableId: value.paidFromAccountStableId,
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
    setSaving(true);
    setError(null);
    try {
      if (!item.materializedEntityStableId) {
        throw new Error(
          isZh
            ? '该费用尚未正式进入审核阶段，请返回待处理区点击“确认识别并进入审核”。'
            : 'This expense has not entered the review stage. Return to Pending and choose Confirm recognition & enter review.',
        );
      }
      await apiFetch(
        `/accounting/expenses/${item.materializedEntityStableId}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            occurredAt: date,
            totalCents: calculated.totalCents,
            sourceCurrency: sourceCurrency.trim().toUpperCase() || null,
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
                paidFromAccountStableId:
                  row.paidFromAccountStableId || null,
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
  const expenseArtifact =
    item.expenseEvidenceSource?.artifact ?? item.artifact;
  const evidence = expenseArtifact.storedUrl
    ? {
        artifactStableId: expenseArtifact.artifactStableId,
        filename: expenseArtifact.originalFilename,
        kind: expenseArtifact.kind,
        deletion:
          item.expenseEvidenceSource === null &&
          expenseArtifact.acquisitionMode === 'MANUAL_UPLOAD'
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
      <section className="mt-4 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
        <strong className="text-sm">
          {isZh ? '将要入账的值（可编辑）' : 'Values to be posted (editable)'}
        </strong>
        <p className="mt-1 text-xs text-slate-600">
          {isZh
            ? '审核阶段只显示并编辑本次将写入费用记录的最终值。请核对日期、币种、总额、分类、税前金额和 HST；付款账户未知或尚未付款时可以留空，后续补录。'
            : 'Review shows only the final values that will be written to the expense record. Verify date, currency, total, category, subtotal, and HST. Funding may remain blank when payment is unknown or not yet made and can be completed later.'}
        </p>
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
                  ? `原始凭证提示币种为 ${recognizedForeignCurrency}。当前将要入账的币种仍默认 CAD，请对照凭证核对并按实际记账需要修改。`
                  : `The source evidence indicates ${recognizedForeignCurrency}. The value to be posted still defaults to CAD; verify the source and adjust the booking as needed.`
                : ambiguousCurrencyEvidence
                  ? isZh
                    ? '原始凭证存在多个或冲突币种。当前将要入账的币种仍默认 CAD，请人工核对后修正。'
                    : 'The source evidence contains multiple or conflicting currencies. The value to be posted still defaults to CAD; verify and correct it manually.'
                  : isZh
                    ? `当前将要入账的币种为 ${foreignCurrencyWarning}。请对照原始凭证核对后再确认。`
                    : `The currency to be posted is currently ${foreignCurrencyWarning}. Verify it against the source evidence before confirming.`}
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
                ? '审核字段可能由收件箱结果预填，但这里的每一项都是“将要入账值”，可直接调整类别、税率和付款账户。手工新增时，金额后按 Enter 可继续下一项并继承上一项设置。'
                : 'Review fields may be prefilled from Inbox, but every row here represents a value to be posted. Adjust category, tax, and funding directly; manual rows keep the Enter-to-next workflow.'}
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
                    ? '已预填待入账条目，原始币种已确认为 CAD；可直接调整类别、税率和付款账户后汇总。'
                    : 'Booking rows are prefilled and the source currency is confirmed as CAD. Adjust category, tax, and funding, then aggregate.'
                  : isZh
                    ? '已预填待入账条目。请先在上方确认原始币种为 CAD；在此之前不会把原币金额汇总成 CAD 费用。'
                    : 'Booking rows are prefilled. Confirm the source currency is CAD above before source-currency amounts can be aggregated into CAD expenses.'}
              </p>
            ) : null}
            {quickRows.map((row, index) => (
              <div
                key={row.key}
                className="grid gap-2 md:grid-cols-[180px_1fr_130px_180px_70px]"
              >
                <div className="min-w-0">
                  {row.recognitionHint ? (
                    <p
                      className="mb-1 truncate text-xs text-slate-500"
                      title={row.description ?? undefined}
                    >
                      {row.description ||
                        (isZh ? `预填条目 ${index + 1}` : `Prefilled item ${index + 1}`)}
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
                <select
                  className="rounded border bg-white px-3 py-2 text-sm"
                  value={row.paidFromAccountStableId}
                  onChange={(event) =>
                    setQuickRows((current) =>
                      current.map((entry) =>
                        entry.key === row.key
                          ? {
                              ...entry,
                              paidFromAccountStableId: event.target.value,
                            }
                          : entry,
                      ),
                    )
                  }
                  aria-label={isZh ? '付款账户' : 'Payment account'}
                >
                  <option value="">
                    {isZh ? '稍后指定付款账户' : 'Assign payment account later'}
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
            className="grid gap-2 md:grid-cols-[1.6fr_130px_120px_120px_180px_70px] md:items-end"
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
                onChange={(event) => {
                  const amount = event.target.value;
                  setRows((current) =>
                    current.map((entry) =>
                      entry.key === row.key
                        ? {
                            ...entry,
                            amount,
                            tax:
                              entry.taxMode === 'HST13'
                                ? toDollars(
                                    Math.round(toCents(amount) * 0.13),
                                  )
                                : entry.tax,
                          }
                        : entry,
                    ),
                  );
                }}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">
                {isZh ? '税' : 'Tax'}
              </span>
              <select
                className="w-full rounded border bg-white px-3 py-2"
                value={row.taxMode}
                onChange={(event) => {
                  const taxMode = event.target.value as ReviewTaxMode;
                  setRows((current) =>
                    current.map((entry) =>
                      entry.key === row.key
                        ? {
                            ...entry,
                            taxMode,
                            tax:
                              taxMode === 'EXEMPT'
                                ? '0.00'
                                : taxMode === 'HST13'
                                  ? toDollars(
                                      Math.round(toCents(entry.amount) * 0.13),
                                    )
                                  : entry.tax,
                          }
                        : entry,
                    ),
                  );
                }}
              >
                <option value="EXEMPT">{isZh ? '免税' : 'Exempt'}</option>
                <option value="HST13">HST 13%</option>
                <option value="MANUAL">
                  {isZh ? '手动税额' : 'Manual tax'}
                </option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">HST</span>
              <input
                className="w-full rounded border bg-white px-3 py-2 disabled:bg-slate-100"
                value={row.tax}
                inputMode="decimal"
                disabled={row.taxMode !== 'MANUAL'}
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
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">
                {isZh ? '付款账户' : 'Payment account'}
              </span>
              <select
                className="w-full rounded border bg-white px-3 py-2"
                value={row.paidFromAccountStableId}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((entry) =>
                      entry.key === row.key
                        ? {
                            ...entry,
                            paidFromAccountStableId: event.target.value,
                          }
                        : entry,
                    ),
                  )
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
              taxMode: current.at(-1)?.taxMode ?? 'EXEMPT',
              tax: '',
              paidFromAccountStableId:
                current.at(-1)?.paidFromAccountStableId ?? '',
            },
          ])
        }
      >
        + {isZh ? '增加类别' : 'Add category'}
      </button>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-slate-500">{isZh ? '备注' : 'Memo'}</span>
        <textarea
          className="min-h-20 w-full rounded border bg-white px-3 py-2"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
        />
      </label>
      <div
        className={`mt-4 rounded-lg border p-3 ${
          expenseBalanced
            ? 'border-emerald-200 bg-emerald-50/60'
            : 'border-red-300 bg-red-50'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className={expenseBalanced ? 'text-emerald-900' : 'text-red-900'}>
            {isZh ? '纵向核算' : 'Vertical reconciliation'}
          </strong>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              expenseBalanced
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {expenseBalanced
              ? isZh
                ? '通过'
                : 'PASSED'
              : isZh
                ? '未通过'
                : 'FAILED'}
          </span>
        </div>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <span className="text-slate-500">
              {isZh ? '税前合计' : 'Subtotal sum'}
            </span>
            <strong className="ml-2">{money(calculated.subtotalCents)}</strong>
          </div>
          <div>
            <span className="text-slate-500">HST</span>
            <strong className="ml-2">{money(calculated.taxCents)}</strong>
          </div>
          <div>
            <span className="text-slate-500">{isZh ? '账单总额' : 'Total'}</span>
            <strong className="ml-2">{money(calculated.totalCents)}</strong>
          </div>
          <div>
            <span className="text-slate-500">{isZh ? '差额' : 'Difference'}</span>
            <strong
              className={`ml-2 ${
                calculated.differenceCents === 0
                  ? 'text-emerald-700'
                  : 'text-red-700'
              }`}
            >
              {money(calculated.differenceCents)}
            </strong>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          {isZh
            ? `公式：税前合计 ${money(calculated.subtotalCents)} + HST ${money(calculated.taxCents)} = 总额 ${money(calculated.totalCents)}。`
            : `Formula: subtotal sum ${money(calculated.subtotalCents)} + HST ${money(calculated.taxCents)} = total ${money(calculated.totalCents)}.`}
        </p>
        {!expenseBalanced ? (
          <p className="mt-2 rounded bg-red-100 px-3 py-2 text-xs font-medium text-red-800">
            {isZh
              ? `金额未对平，当前差额 ${money(calculated.differenceCents)}；确认入账按钮已锁定。`
              : `Amounts do not reconcile. Current difference: ${money(calculated.differenceCents)}. Posting is locked.`}
          </p>
        ) : null}
      </div>
      {missingFundingCount > 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {isZh
            ? `有 ${missingFundingCount} 个费用分类尚未指定付款账户。可能尚未付款或付款方式未知时可以留空；这不会阻止费用事实确认，之后可在付款归属流程补录。`
            : `${missingFundingCount} expense split(s) do not yet have a funding account. This may remain blank when unpaid or unknown and does not block confirmation; funding can be completed later.`}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {isZh
          ? '确认后会创建正式费用记录，原始凭证进入受保护证据链。付款账户已完整时会同步生成 Journal；付款账户未知或尚未付款时保留待补录状态，之后完成付款归属即可生成对应 Journal。'
          : 'Confirmation creates the formal expense and protects the source evidence. A Journal is posted immediately when funding attribution is complete; otherwise the expense remains awaiting funding completion and can be posted after payment attribution is supplied.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void confirmExpense()}
          disabled={saving || !date || !expenseBalanced}
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
