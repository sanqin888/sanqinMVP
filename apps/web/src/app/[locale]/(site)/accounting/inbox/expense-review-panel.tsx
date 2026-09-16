'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiFetch } from '@/lib/api/client';
import {
  type AccountingAccount,
  type AccountingCategory,
  type AccountingExpenseReviewRow,
  type AccountingInboxItem,
  latestParse,
  makeReviewKey,
  money,
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
};

type QuickTaxMode = 'EXEMPT' | 'HST13';

type QuickRow = {
  key: string;
  amount: string;
  categoryStableId: string;
  taxMode: QuickTaxMode;
};

export function AccountingInboxExpenseReviewPanel({
  item,
  categories,
  accounts,
  isZh,
  onClose,
  onConfirmed,
}: Props) {
  const [date, setDate] = useState('');
  const [total, setTotal] = useState('');
  const [sourceCurrency, setSourceCurrency] = useState('');
  const [accountStableId, setAccountStableId] = useState('');
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
  const cadAccounts = useMemo(
    () => accounts.filter((account) => account.currency === 'CAD'),
    [accounts],
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
    const detectedSourceCurrency = extraction.sourceCurrency?.toUpperCase() ?? '';
    const canPrefillCadBookAmount =
      extraction.sourceCurrencyEvidence === 'EXPLICIT_TEXT' &&
      detectedSourceCurrency === 'CAD';

    setDate(extraction.date ?? '');
    setSourceCurrency(detectedSourceCurrency);
    setTotal(
      canPrefillCadBookAmount
        ? toDollars(extraction.totalCents ?? subtotalCents + taxCents)
        : '',
    );
    setAccountStableId('');
    setMemo('');
    setRows([
      {
        key: makeReviewKey(),
        categoryStableId: defaultCategory,
        amount: canPrefillCadBookAmount ? toDollars(subtotalCents) : '',
        tax: canPrefillCadBookAmount ? toDollars(taxCents) : '',
      },
    ]);
    setQuickRows([]);
    setShowQuick(false);
    setError(null);
  }, [cadAccounts, expenseCategories, item]);

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
            accountStableId: accountStableId || null,
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

  const extraction = latestParse(item);
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
  const evidenceUrl =
    item.artifact.kind === 'IMAGE'
      ? `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(item.artifact.artifactStableId)}/content`
      : item.artifact.storedUrl;

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
      <div className="mt-4 rounded-lg border bg-white p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <strong>{isZh ? '原始凭证金额' : 'Source document amounts'}</strong>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span>{isZh ? '原始币种' : 'Source currency'}</span>
            <input
              className="w-20 rounded border px-2 py-1 uppercase"
              maxLength={3}
              value={sourceCurrency}
              onChange={(event) => setSourceCurrency(event.target.value.toUpperCase())}
            />
          </label>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div>
            <span className="text-slate-500">{isZh ? '税前' : 'Subtotal'}</span>
            <strong className="ml-2">
              {sourceSubtotalCents == null
                ? '-'
                : `${sourceCurrency || '?'} ${money(sourceSubtotalCents)}`}
            </strong>
          </div>
          <div>
            <span className="text-slate-500">{isZh ? '税' : 'Tax'}</span>
            <strong className="ml-2">
              {sourceTaxCents == null
                ? '-'
                : `${sourceCurrency || '?'} ${money(sourceTaxCents)}`}
            </strong>
          </div>
          <div>
            <span className="text-slate-500">{isZh ? '总额' : 'Total'}</span>
            <strong className="ml-2">
              {sourceTotalCents == null
                ? '-'
                : `${sourceCurrency || '?'} ${money(sourceTotalCents)}`}
            </strong>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {sourceCurrencyEvidence === 'EXPLICIT_TEXT'
            ? isZh
              ? '币种来自凭证中的明确文字；仍可在确认前人工修正。'
              : 'Currency came from explicit document text and can still be corrected before confirmation.'
            : sourceCurrencyEvidence === 'AMBIGUOUS'
              ? isZh
                ? '凭证中出现多个币种，请人工确认原始币种。'
                : 'Multiple currencies were detected; confirm the source currency manually.'
              : isZh
                ? '凭证未明确币种，请先人工确认原始币种；CAD 记账金额不会自动从原始金额带入。'
                : 'The document did not state a currency. Confirm the source currency manually; CAD booking amounts are not copied from the source amounts.'}
        </p>
        {textractCurrencySuggestion ? (
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? `AWS Textract 币种建议：${textractCurrencySuggestion}${textractCurrencyConfidence == null ? '' : `（${textractCurrencyConfidence.toFixed(1)}%）`}。仅作识别参考，不会自动成为原始币种或 CAD 记账币种。`
              : `AWS Textract currency suggestion: ${textractCurrencySuggestion}${textractCurrencyConfidence == null ? '' : ` (${textractCurrencyConfidence.toFixed(1)}%)`}. This is recognition evidence only and does not become source or CAD booking currency automatically.`}
          </p>
        ) : null}
      </div>
      {sourceCurrency && sourceCurrency !== 'CAD' ? (
        <p className="mt-3 rounded bg-orange-50 px-3 py-2 text-xs text-orange-800">
          {isZh
            ? '这是外币凭证。下面所有类别金额和总额必须填写实际记入 SanQ 的 CAD 金额（例如银行卡实际扣款），不要直接照抄外币金额。'
            : 'This is a foreign-currency document. Enter the actual CAD booked amounts below (for example, the card charge), not the source-currency amounts.'}
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">{isZh ? '费用日期' : 'Expense date'}</span>
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
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">
            {isZh ? '付款账户（CAD）' : 'Paid from (CAD)'}
          </span>
          <select
            className="w-full rounded border bg-white px-3 py-2"
            value={accountStableId}
            onChange={(event) => setAccountStableId(event.target.value)}
          >
            <option value="">{isZh ? '暂不指定' : 'Not specified'}</option>
            {cadAccounts.map((account) => (
              <option key={account.accountStableId} value={account.accountStableId}>
                {account.name}
              </option>
            ))}
          </select>
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
                ? '按收据商品逐行录入 CAD 金额、类别和税率；金额后按 Enter 可继续下一项，并继承上一项类别/税率。汇总后只保留类别总额，商品行不会保存。'
                : 'Enter receipt items one by one in CAD. Press Enter after an amount to continue with the previous category/tax. Only category totals are persisted.'}
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
            {quickRows.map((row, index) => (
              <div
                key={row.key}
                className="grid gap-2 md:grid-cols-[140px_1fr_130px_70px]"
              >
                <input
                  ref={(node) => {
                    if (node) quickAmountInputs.current.set(row.key, node);
                    else quickAmountInputs.current.delete(row.key);
                  }}
                  className="rounded border bg-white px-3 py-2 text-sm"
                  inputMode="decimal"
                  enterKeyHint="next"
                  placeholder="CAD 0.00"
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
              ? '确认并入账'
              : 'Confirm and post'}
        </button>
        {evidenceUrl ? (
          <a
            className="rounded border bg-white px-4 py-2 text-sm text-blue-600"
            href={evidenceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {isZh ? '打开原始文件' : 'Open original file'}
          </a>
        ) : null}
      </div>
    </section>
  );
}
