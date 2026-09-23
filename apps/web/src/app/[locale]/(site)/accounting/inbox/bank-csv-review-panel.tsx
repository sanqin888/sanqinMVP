'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AccountingAccount } from '../contracts/chart';
import type { AccountingInboxItem } from '../contracts/inbox';
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
    return isZh ? '可能匹配' : 'Possible candidate';
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

export function AccountingInboxBankCsvReviewPanel({
  item,
  accounts,
  knownStoreStableIds,
  isZh,
  onClose,
}: {
  item: AccountingInboxItem;
  accounts: AccountingAccount[];
  knownStoreStableIds: string[];
  isZh: boolean;
  onClose: () => void;
}) {
  const eligibleBanks = useMemo(
    () =>
      accounts.filter(
        (account) => account.currency === 'CAD' && account.type === 'BANK',
      ),
    [accounts],
  );
  const [storeStableId, setStoreStableId] = useState('');
  const [bankAccountStableId, setBankAccountStableId] = useState('');
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
        artifactStableId: item.artifact.artifactStableId,
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
    <section className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-cyan-950">
            {isZh ? '银行流水预览 / 到账匹配' : 'Bank statement preview / payout match'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {item.artifact.originalFilename ?? item.artifact.artifactStableId}
          </p>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            {isZh
              ? '这是收件箱审核辅助，不会自动记账。先核对银行流水中的平台到账、已有 payout 匹配和跨期行；确认材料类别后再标记已审核，随后到“平台结算”执行正式到账入账。'
              : 'This is Inbox review assistance and never posts automatically. Review provider deposits, existing payout matches, and cross-period rows here; classify and mark the evidence reviewed before continuing to Provider settlements for formal posting.'}
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          onClick={onClose}
        >
          {isZh ? '关闭预览' : 'Close preview'}
        </button>
      </div>

      <form
        className="mt-4 grid gap-3 rounded-lg border border-cyan-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-3"
        onSubmit={(event) => void previewMatches(event)}
      >
        <label className="text-xs text-slate-600">
          {isZh ? '门店 Stable ID' : 'Store stable ID'}
          <input
            list="inbox-bank-review-stores"
            className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
            value={storeStableId}
            onChange={(event) => {
              setStoreStableId(event.target.value);
              setPreview(null);
              setExcludedRowNumbers(new Set());
            }}
          />
          <datalist id="inbox-bank-review-stores">
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
              busy || !storeStableId.trim() || !bankAccountStableId
            }
            className="rounded-lg border border-cyan-300 bg-white px-4 py-2 text-sm font-medium text-cyan-950 disabled:opacity-50"
          >
            {busy
              ? isZh
                ? '分析中…'
                : 'Analyzing…'
              : isZh
                ? '预览匹配'
                : 'Preview matches'}
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white px-2.5 py-1">
              {isZh ? '入账行' : 'Deposits'}: {preview.source.depositRowCount}
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
            <table className="min-w-[980px] w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-2 py-2">{isZh ? '本期参与' : 'Include'}</th>
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
                      <td className="px-2 py-2">{deposit.rowNumber}</td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            {isZh
              ? '没有 provider hint 且没有现有 payout 候选的普通银行入账默认排除；其他行可人工取消“本期参与”。该选择目前只影响本次预览，不修改原始 CSV，也不会创建 payout 或 Journal。'
              : 'Ordinary deposits with neither a provider hint nor an existing payout candidate start excluded. Other rows can be removed from this preview by clearing Include. This does not edit the original CSV or create a payout or Journal.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
