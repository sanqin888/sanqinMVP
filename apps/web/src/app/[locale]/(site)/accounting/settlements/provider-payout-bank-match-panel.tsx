'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AccountingAccount } from '../contracts/chart';
import type { AccountingManualUploadResult } from '../contracts/inbox';
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
    return isZh ? '附近日期有候选' : 'Nearby candidate';
  }
  return isZh ? '未匹配' : 'Unmatched';
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

export function ProviderPayoutBankMatchPanel({
  isZh,
  knownStoreStableIds,
  eligibleBanks,
}: {
  isZh: boolean;
  knownStoreStableIds: string[];
  eligibleBanks: AccountingAccount[];
}) {
  const [storeStableId, setStoreStableId] = useState('');
  const [bankAccountStableId, setBankAccountStableId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] =
    useState<AccountingProviderPayoutBankMatchPreview | null>(null);
  const [excludedRowNumbers, setExcludedRowNumbers] = useState<Set<number>>(
    () => new Set(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!file) {
      setError(isZh ? '请选择银行 CSV。' : 'Select a bank CSV.');
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
      const formData = new FormData();
      formData.append('file', file);
      const artifact = await apiFetch<AccountingManualUploadResult>(
        '/accounting/inbox/artifacts',
        {
          method: 'POST',
          body: formData,
        },
      );
      const query = new URLSearchParams({
        artifactStableId:
          artifact.duplicateOfArtifactStableId ?? artifact.artifactStableId,
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
        {isZh ? '银行 CSV 到账匹配预览' : 'Bank CSV payout match preview'}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-600">
          {isZh
            ? '只接受强银行流水格式：包括 CIBC 原始无表头四列导出（日期 / Description / Withdrawals / Deposits），或带独立“Withdrawals / Deposits”“Funds Out / Funds In”方向列的格式。这里只保存证据并寻找现有 payout 候选，不会自动记账，也不会从模糊的 Date + Amount + Description 猜测银行流水。'
            : 'Only strong bank transaction formats are accepted, including the native CIBC headerless four-column export (date / Description / Withdrawals / Deposits) or files with explicit Withdrawals / Deposits or Funds Out / Funds In columns. This stores evidence and finds existing payout candidates only; it never posts automatically or guesses from a generic Date + Amount + Description table.'}
        </p>

        <form
          className="grid gap-3 rounded-lg border border-cyan-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => void previewMatches(event)}
        >
          <label className="text-xs text-slate-600">
            {isZh ? '银行 CSV' : 'Bank CSV'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-1 block w-full text-sm"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setExcludedRowNumbers(new Set());
                setError(null);
              }}
            />
          </label>

          <label className="text-xs text-slate-600">
            {isZh ? '门店 Stable ID' : 'Store stable ID'}
            <input
              list="provider-payout-bank-match-stores"
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
              value={storeStableId}
              onChange={(event) => {
                setStoreStableId(event.target.value);
                setPreview(null);
                setExcludedRowNumbers(new Set());
              }}
            />
            <datalist id="provider-payout-bank-match-stores">
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
                busy || !file || !storeStableId.trim() || !bankAccountStableId
              }
              className="rounded-lg border border-cyan-300 bg-white px-4 py-2 text-sm font-medium text-cyan-950 disabled:opacity-50"
            >
              {busy
                ? isZh
                  ? '分析中…'
                  : 'Analyzing…'
                : isZh
                  ? '上传并预览匹配'
                  : 'Upload and preview'}
            </button>
          </div>
        </form>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? '入账行' : 'Deposits'}: {preview.source.depositRowCount}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? '已精确匹配' : 'Exact'}: {preview.counts.exactExisting}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? '精确候选冲突' : 'Ambiguous'}:{' '}
                {preview.counts.ambiguousExisting}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? '可能匹配' : 'Possible'}: {preview.counts.possibleExisting}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? '未匹配' : 'Unmatched'}: {preview.counts.unmatched}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? '本次参与' : 'Included this settlement'}:{' '}
                {includedDepositCount} · {money(includedAmountCents)}
              </span>
              {excludedDepositCount > 0 ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  {isZh ? '人工排除' : 'Manually excluded'}:{' '}
                  {excludedDepositCount}
                </span>
              ) : null}
              {preview.source.invalidRowCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                  {isZh ? '异常行' : 'Invalid rows'}:{' '}
                  {preview.source.invalidRowCount}
                </span>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-lg border border-cyan-100 bg-white">
              <table className="min-w-[920px] w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-2 py-2">
                      {isZh ? '本期参与' : 'Include'}
                    </th>
                    <th className="px-2 py-2">{isZh ? '行' : 'Row'}</th>
                    <th className="px-2 py-2">{isZh ? '日期' : 'Date'}</th>
                    <th className="px-2 py-2 text-right">
                      {isZh ? '入账金额' : 'Deposit'}
                    </th>
                    <th className="px-2 py-2">
                      {isZh ? '银行描述' : 'Bank description'}
                    </th>
                    <th className="px-2 py-2">Provider hint</th>
                    <th className="px-2 py-2">{isZh ? '状态' : 'Status'}</th>
                    <th className="px-2 py-2">
                      {isZh ? '现有 payout 候选' : 'Existing payout candidates'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.deposits.map((deposit) => {
                    const excluded = excludedRowNumbers.has(deposit.rowNumber);
                    return (
                      <tr
                        key={deposit.rowNumber}
                        className={
                          excluded ? 'bg-slate-50 text-slate-400' : ''
                        }
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
                        <td className="px-2 py-2">{deposit.rowNumber}</td>
                        <td className="px-2 py-2">{deposit.occurredOn}</td>
                        <td className="px-2 py-2 text-right font-semibold">
                          {money(deposit.amountCents)}
                        </td>
                        <td className="max-w-[280px] px-2 py-2">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500">
              {isZh
                ? '没有 provider hint 且没有现有 payout 候选的普通银行入账默认排除；其他入账可通过“本期参与”人工取消。排除只影响本次 settlement preview，不会修改或删除原始银行证据，也不会自动创建 canonical payout。PAYOUT-E-A 的人工选择目前只存在于本次页面会话；持久化 reconciliation decision 留给后续 E-B。'
                : 'Ordinary bank deposits with neither a provider hint nor an existing payout candidate start excluded by default; any other row can be removed by clearing Include. Exclusion affects only this settlement preview, never edits or deletes the original bank evidence, and never creates a canonical payout automatically. PAYOUT-E-A keeps this selection only for the current page session; durable reconciliation decisions remain E-B scope.'}
            </p>
          </div>
        ) : null}
      </div>
    </details>
  );
}
