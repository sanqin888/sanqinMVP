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
          </div>

          <div className="overflow-x-auto rounded-lg border border-cyan-100 bg-white">
            <table className="min-w-[980px] w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
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
                {preview.deposits.map((deposit) => (
                    <tr key={deposit.rowNumber}>
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
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            {isZh
              ? '收件箱这里只用于核对材料内容和已有 payout 匹配，不做“本期参与 / 排除”决定。完成分类并标记已审核后，请到“平台结算”处理结算范围和正式入账。'
              : 'Inbox only verifies the evidence and existing payout matches. Include/exclude decisions belong to Provider settlements after this evidence is classified and marked reviewed.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
