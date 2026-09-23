'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AccountingAccount } from '../contracts/chart';
import type { AccountingFinancialProvider } from '../contracts/core';
import type { AccountingManualUploadLibraryItem } from '../contracts/inbox';
import type {
  AccountingProviderPayoutBankMatchPreview,
} from '../contracts/provider-payout-bank-match';

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const statusLabel = (
  status: AccountingProviderPayoutBankMatchPreview['deposits'][number]['status'],
  isZh: boolean,
): string => {
  if (status === 'EXACT_EXISTING_PAYOUT') {
    return isZh ? '已精确匹配现有到账' : 'Exact existing payout';
  }
  if (status === 'AMBIGUOUS_EXISTING_PAYOUT') {
    return isZh ? '存在多个精确候选' : 'Multiple exact candidates';
  }
  if (status === 'POSSIBLE_EXISTING_PAYOUT') {
    return isZh ? '可能匹配现有到账' : 'Possible existing payout';
  }
  return isZh ? '未匹配，可核对后入账' : 'Unmatched; review before posting';
};

const statusClass = (
  status: AccountingProviderPayoutBankMatchPreview['deposits'][number]['status'],
): string => {
  if (status === 'EXACT_EXISTING_PAYOUT') {
    return 'bg-emerald-100 text-emerald-800';
  }
  if (status === 'UNMATCHED') return 'bg-amber-100 text-amber-800';
  return 'bg-blue-100 text-blue-800';
};

const isReviewedBankCsvEvidence = (
  item: AccountingManualUploadLibraryItem,
): boolean =>
  item.status === 'CONFIRMED' &&
  item.classification === 'OTHER_DOCUMENT' &&
  item.kind === 'CSV' &&
  item.duplicateOf === null &&
  item.contentUrl !== null;

export function ProviderPayoutSettlementBankCsvPanel({
  isZh,
  knownStoreStableIds,
  eligibleBanks,
  onUseDeposit,
}: {
  isZh: boolean;
  knownStoreStableIds: string[];
  eligibleBanks: AccountingAccount[];
  onUseDeposit: (deposit: {
    provider: AccountingFinancialProvider;
    payoutDate: string;
    amountCents: number;
    destinationBankAccountStableId: string;
  }) => void;
}) {
  const [manualUploads, setManualUploads] = useState<
    AccountingManualUploadLibraryItem[]
  >([]);
  const [artifactStableId, setArtifactStableId] = useState('');
  const [storeStableId, setStoreStableId] = useState('');
  const [bankAccountStableId, setBankAccountStableId] = useState('');
  const [preview, setPreview] =
    useState<AccountingProviderPayoutBankMatchPreview | null>(null);
  const [excludedRowNumbers, setExcludedRowNumbers] = useState<Set<number>>(
    () => new Set(),
  );
  const [loadingEvidence, setLoadingEvidence] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviewedBankCsvEvidence = useMemo(
    () => manualUploads.filter(isReviewedBankCsvEvidence),
    [manualUploads],
  );

  const loadEvidence = useCallback(async () => {
    setLoadingEvidence(true);
    setError(null);
    try {
      const uploads = await apiFetch<AccountingManualUploadLibraryItem[]>(
        '/accounting/inbox/manual-uploads?limit=200',
      );
      setManualUploads(uploads);
      setArtifactStableId((current) =>
        uploads.some(
          (item) =>
            item.artifactStableId === current &&
            isReviewedBankCsvEvidence(item),
        )
          ? current
          : '',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingEvidence(false);
    }
  }, []);

  useEffect(() => {
    void loadEvidence();
  }, [loadEvidence]);

  useEffect(() => {
    if (!storeStableId && knownStoreStableIds.length > 0) {
      setStoreStableId(knownStoreStableIds[0]);
    }
  }, [knownStoreStableIds, storeStableId]);

  useEffect(() => {
    if (
      !bankAccountStableId ||
      !eligibleBanks.some(
        (account) => account.accountStableId === bankAccountStableId,
      )
    ) {
      setBankAccountStableId(eligibleBanks[0]?.accountStableId ?? '');
    }
  }, [bankAccountStableId, eligibleBanks]);

  const includedDepositCount =
    preview?.deposits.filter(
      (deposit) => !excludedRowNumbers.has(deposit.rowNumber),
    ).length ?? 0;
  const excludedDepositCount = preview
    ? preview.deposits.length - includedDepositCount
    : 0;
  const includedAmountCents =
    preview?.deposits.reduce(
      (sum, deposit) =>
        excludedRowNumbers.has(deposit.rowNumber)
          ? sum
          : sum + deposit.amountCents,
      0,
    ) ?? 0;

  async function previewMatches(event: FormEvent) {
    event.preventDefault();
    if (!artifactStableId) {
      setError(
        isZh
          ? '请选择一份已审核银行流水。'
          : 'Select a reviewed bank statement.',
      );
      return;
    }
    if (!storeStableId.trim()) {
      setError(isZh ? '请输入门店 Stable ID。' : 'Enter the store stable ID.');
      return;
    }
    if (!bankAccountStableId) {
      setError(isZh ? '请选择银行账户。' : 'Select a bank account.');
      return;
    }

    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const query = new URLSearchParams({
        artifactStableId,
        storeStableId: storeStableId.trim(),
        destinationBankAccountStableId: bankAccountStableId,
      });
      const result =
        await apiFetch<AccountingProviderPayoutBankMatchPreview>(
          `/accounting/provider-payouts/bank-match-preview?${query.toString()}`,
        );
      setExcludedRowNumbers(
        new Set(
          result.deposits
            .filter(
              (deposit) =>
                deposit.providerHint === null &&
                deposit.candidates.length === 0,
            )
            .map((deposit) => deposit.rowNumber),
        ),
      );
      setPreview(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-cyan-950">
        {isZh ? '已审核银行流水 · 结算范围 / 入账' : 'Reviewed bank statement · settlement / posting'}
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-600">
          {isZh
            ? '这里只消费财务收件箱中已标记“已审核”的银行 CSV。请在这里决定哪些平台到账属于本次结算；排除不会修改原始银行证据。未匹配且已识别平台的参与行可以直接带入上方到账表单，再由你确认后正式记账。'
            : 'This surface consumes only reviewed bank CSV evidence from Accounting Inbox. Decide settlement inclusion here; exclusion never edits the original bank evidence. Included unmatched rows with a provider hint can populate the posting form above for explicit confirmation.'}
        </p>

        <form
          className="grid gap-3 rounded-lg border border-cyan-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => void previewMatches(event)}
        >
          <label className="text-xs text-slate-600">
            {isZh ? '已审核银行流水' : 'Reviewed bank statement'}
            <select
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
              value={artifactStableId}
              disabled={loadingEvidence}
              onChange={(event) => {
                setArtifactStableId(event.target.value);
                setPreview(null);
                setExcludedRowNumbers(new Set());
                setError(null);
              }}
            >
              <option value="">
                {loadingEvidence
                  ? isZh
                    ? '正在读取…'
                    : 'Loading…'
                  : isZh
                    ? '选择已审核 CSV'
                    : 'Select reviewed CSV'}
              </option>
              {reviewedBankCsvEvidence.map((item) => (
                <option
                  key={item.artifactStableId}
                  value={item.artifactStableId}
                >
                  {item.originalFilename ?? item.artifactStableId}
                  {item.reviewedAt
                    ? ` · ${item.reviewedAt.slice(0, 10)}`
                    : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-600">
            {isZh ? '门店 Stable ID' : 'Store stable ID'}
            <input
              list="provider-payout-settlement-bank-stores"
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
              value={storeStableId}
              onChange={(event) => {
                setStoreStableId(event.target.value);
                setPreview(null);
                setExcludedRowNumbers(new Set());
              }}
            />
            <datalist id="provider-payout-settlement-bank-stores">
              {knownStoreStableIds.map((store) => (
                <option key={store} value={store} />
              ))}
            </datalist>
          </label>

          <label className="text-xs text-slate-600">
            {isZh ? '对应银行账户' : 'Bank account'}
            <select
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
              value={bankAccountStableId}
              onChange={(event) => {
                setBankAccountStableId(event.target.value);
                setPreview(null);
                setExcludedRowNumbers(new Set());
              }}
            >
              <option value="">
                {isZh ? '选择 CAD BANK' : 'Select CAD BANK'}
              </option>
              {eligibleBanks.map((account) => (
                <option
                  key={account.accountStableId}
                  value={account.accountStableId}
                >
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              disabled={
                busy ||
                loadingEvidence ||
                !artifactStableId ||
                !storeStableId.trim() ||
                !bankAccountStableId
              }
              className="rounded-lg border border-cyan-300 bg-white px-4 py-2 text-sm font-medium text-cyan-950 disabled:opacity-50"
            >
              {busy
                ? isZh
                  ? '分析中…'
                  : 'Analyzing…'
                : isZh
                  ? '加载结算行'
                  : 'Load settlement rows'}
            </button>
          </div>
        </form>

        {!loadingEvidence && reviewedBankCsvEvidence.length === 0 ? (
          <p className="text-xs text-slate-500">
            {isZh
              ? '当前没有已审核银行 CSV。请先在财务收件箱完成银行流水预览、分类和审核确认。'
              : 'No reviewed bank CSV is available. Complete preview, classification, and review in Accounting Inbox first.'}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? '银行入账行' : 'Deposits'}: {preview.source.depositRowCount}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? '已精确匹配' : 'Exact'}: {preview.counts.exactExisting}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? '可能匹配' : 'Possible'}: {preview.counts.possibleExisting}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? '未匹配' : 'Unmatched'}: {preview.counts.unmatched}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? '本次参与' : 'Included'}: {includedDepositCount} ·{' '}
                {money(includedAmountCents)}
              </span>
              {excludedDepositCount > 0 ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  {isZh ? '人工排除' : 'Excluded'}: {excludedDepositCount}
                </span>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-lg border border-cyan-100 bg-white">
              <table className="min-w-[1120px] w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-2 py-2">{isZh ? '本期参与' : 'Include'}</th>
                    <th className="px-2 py-2">{isZh ? '日期' : 'Date'}</th>
                    <th className="px-2 py-2 text-right">
                      {isZh ? '金额' : 'Amount'}
                    </th>
                    <th className="px-2 py-2">
                      {isZh ? '银行描述' : 'Bank description'}
                    </th>
                    <th className="px-2 py-2">Provider</th>
                    <th className="px-2 py-2">{isZh ? '匹配状态' : 'Match status'}</th>
                    <th className="px-2 py-2">
                      {isZh ? '现有 payout 候选' : 'Existing payout candidates'}
                    </th>
                    <th className="px-2 py-2">{isZh ? '操作' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.deposits.map((deposit) => {
                    const excluded = excludedRowNumbers.has(deposit.rowNumber);
                    const providerHint = deposit.providerHint;
                    const canUseForPosting =
                      !excluded &&
                      deposit.status === 'UNMATCHED' &&
                      providerHint !== null;
                    return (
                      <tr
                        key={deposit.rowNumber}
                        className={excluded ? 'bg-slate-50 text-slate-400' : ''}
                      >
                        <td className="px-2 py-2">
                          <label className="inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={(event) => {
                                setExcludedRowNumbers((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) {
                                    next.delete(deposit.rowNumber);
                                  } else {
                                    next.add(deposit.rowNumber);
                                  }
                                  return next;
                                });
                              }}
                            />
                            <span>
                              {excluded
                                ? isZh
                                  ? '已排除'
                                  : 'Excluded'
                                : isZh
                                  ? '参与'
                                  : 'Included'}
                            </span>
                          </label>
                        </td>
                        <td className="px-2 py-2">{deposit.occurredOn}</td>
                        <td className="px-2 py-2 text-right font-semibold">
                          {money(deposit.amountCents)}
                        </td>
                        <td className="max-w-[300px] px-2 py-2">
                          {deposit.description ?? '—'}
                        </td>
                        <td className="px-2 py-2">
                          {deposit.providerHint ?? '—'}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={`rounded-full px-2 py-1 font-semibold ${statusClass(
                              deposit.status,
                            )}`}
                          >
                            {statusLabel(deposit.status, isZh)}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          {deposit.candidates.length === 0
                            ? '—'
                            : deposit.candidates
                                .map(
                                  (candidate) =>
                                    `${candidate.provider} · ${candidate.payoutDate} · ${candidate.payoutStableId}`,
                                )
                                .join(' | ')}
                        </td>
                        <td className="px-2 py-2">
                          {canUseForPosting && providerHint ? (
                            <button
                              type="button"
                              className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 font-medium text-emerald-800"
                              onClick={() =>
                                onUseDeposit({
                                  provider: providerHint,
                                  payoutDate: deposit.occurredOn,
                                  amountCents: deposit.amountCents,
                                  destinationBankAccountStableId:
                                    bankAccountStableId,
                                })
                              }
                            >
                              {isZh ? '带入入账表单' : 'Use for posting'}
                            </button>
                          ) : deposit.status === 'EXACT_EXISTING_PAYOUT' ? (
                            <span className="text-emerald-700">
                              {isZh ? '已入账' : 'Already posted'}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500">
              {isZh
                ? '“排除”只影响当前结算会话，不修改原始 CSV；例如跨期到账可以保留为银行证据但不参与本次结算。EXACT / POSSIBLE / AMBIGUOUS 行不会提供新入账按钮，避免重复入账。'
                : 'Exclusion affects only the current settlement session and never edits the original CSV. EXACT, POSSIBLE, and AMBIGUOUS rows do not expose a new-post action, preventing duplicate posting.'}
            </p>
          </div>
        ) : null}
      </div>
    </details>
  );
}
