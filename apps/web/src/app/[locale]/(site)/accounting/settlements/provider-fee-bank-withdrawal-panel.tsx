'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AccountingAccount } from '../contracts/chart';
import type { AccountingManualUploadLibraryItem } from '../contracts/inbox';
import type {
  AccountingProviderFeeBankRowDecision,
  AccountingProviderFeeBankRowScope,
  AccountingProviderFeeBankWithdrawalPreview,
} from '../contracts/provider-fee-bank-row-decisions';
import type { AccountingTrialBalanceReport } from '../contracts/reports';

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const isReviewedBankCsvEvidence = (
  item: AccountingManualUploadLibraryItem,
): boolean =>
  item.status === 'CONFIRMED' &&
  item.classification === 'OTHER_DOCUMENT' &&
  item.kind === 'CSV' &&
  item.duplicateOf === null &&
  item.contentUrl !== null;

export function ProviderFeeBankWithdrawalPanel({
  isZh,
  knownStoreStableIds,
  eligibleBanks,
}: {
  isZh: boolean;
  knownStoreStableIds: string[];
  eligibleBanks: AccountingAccount[];
}) {
  const [uploads, setUploads] = useState<AccountingManualUploadLibraryItem[]>(
    [],
  );
  const [artifactStableId, setArtifactStableId] = useState('');
  const [storeStableId, setStoreStableId] = useState('');
  const [bankAccountStableId, setBankAccountStableId] = useState('');
  const [preview, setPreview] =
    useState<AccountingProviderFeeBankWithdrawalPreview | null>(null);
  const [scope, setScope] =
    useState<AccountingProviderFeeBankRowScope | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [feePayableCents, setFeePayableCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reviewed = useMemo(
    () => uploads.filter(isReviewedBankCsvEvidence),
    [uploads],
  );

  const loadEvidence = useCallback(async () => {
    const rows = await apiFetch<AccountingManualUploadLibraryItem[]>(
      '/accounting/inbox/manual-uploads?limit=200',
    );
    setUploads(rows);
  }, []);

  const loadFeePayable = useCallback(async () => {
    const report = await apiFetch<AccountingTrialBalanceReport>(
      '/accounting/report/trial-balance?currency=CAD',
    );
    const account = report.accounts.find(
      (row) => row.accountStableId === 'account_clover_fee_payable',
    );
    setFeePayableCents(account?.closingCreditBalanceCents ?? 0);
  }, []);

  useEffect(() => {
    void Promise.all([loadEvidence(), loadFeePayable()]).catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [loadEvidence, loadFeePayable]);

  useEffect(() => {
    if (!storeStableId && knownStoreStableIds.length) {
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

  async function loadRows(event?: FormEvent) {
    event?.preventDefault();
    if (!artifactStableId || !storeStableId.trim() || !bankAccountStableId) {
      setError(
        isZh
          ? '请选择已审核银行 CSV、门店和银行账户。'
          : 'Select a reviewed bank CSV, store, and bank account.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        artifactStableId,
        storeStableId: storeStableId.trim(),
        bankAccountStableId,
      });
      const [nextPreview, nextScope] = await Promise.all([
        apiFetch<AccountingProviderFeeBankWithdrawalPreview>(
          `/accounting/provider-fees/bank-withdrawal-preview?${query.toString()}`,
        ),
        apiFetch<AccountingProviderFeeBankRowScope>(
          `/accounting/provider-fees/bank-row-decisions?${query.toString()}`,
        ),
      ]);
      const decisionByRow = new Map(
        nextScope.decisions.map((decision) => [
          decision.rowNumber,
          decision.decision,
        ]),
      );
      setExcluded(
        new Set(
          nextPreview.withdrawals
            .filter((row) => {
              const decision = decisionByRow.get(row.rowNumber);
              return decision ? decision === 'EXCLUDED' : true;
            })
            .map((row) => row.rowNumber),
        ),
      );
      setPreview(nextPreview);
      setScope(nextScope);
      await loadFeePayable();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirmScope() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const next = await apiFetch<AccountingProviderFeeBankRowScope>(
        '/accounting/provider-fees/bank-row-decisions/confirm',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artifactStableId,
            storeStableId: storeStableId.trim(),
            bankAccountStableId,
            includedRowNumbers: preview.withdrawals
              .filter((row) => !excluded.has(row.rowNumber))
              .map((row) => row.rowNumber),
          }),
        },
      );
      setScope(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function clearDecision(
    decision: AccountingProviderFeeBankRowDecision,
  ) {
    setClearingId(decision.decisionStableId);
    setError(null);
    try {
      await apiFetch('/accounting/provider-fees/from-bank-row-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionStableId: decision.decisionStableId,
        }),
      });
      await loadRows();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setClearingId(null);
    }
  }

  const decisionByRow = new Map(
    scope?.decisions.map((decision) => [decision.rowNumber, decision]) ?? [],
  );

  return (
    <details className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-amber-950">
        {isZh
          ? 'Clover 费用银行扣款 · 应付清算'
          : 'Clover fee bank withdrawals · payable clearing'}
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-600">
          {isZh
            ? '这里只清算已经由 Clover statement 记入“Clover 费用应付”的金额。银行扣款只做 Dr Clover 费用应付 / Cr 银行，不会再次生成费用。仅识别银行描述明确指向 Clover / First Data 的 withdrawal 行。'
            : 'This clears amounts already accrued by Clover statements into Clover fee payable. Bank withdrawals post only Dr Clover fee payable / Cr Bank and never recreate expense. Only withdrawals explicitly identified as Clover / First Data are eligible.'}
        </p>
        <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
          <div className="text-xs text-slate-500">
            {isZh ? '当前 Clover 费用应付' : 'Current Clover fee payable'}
          </div>
          <div className="mt-0.5 text-lg font-semibold text-amber-950">
            {feePayableCents === null
              ? isZh
                ? '读取中…'
                : 'Loading…'
              : `${money(feePayableCents)} CAD`}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {isZh
              ? '直接来自 canonical Journal 的当前贷方余额；每次银行扣款清算后自动刷新。'
              : 'Current credit balance from canonical Journal; refreshed after each bank-withdrawal clearing.'}
          </div>
        </div>

        <form
          onSubmit={(event) => void loadRows(event)}
          className="grid gap-3 rounded-lg border border-amber-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <label className="text-xs text-slate-600">
            {isZh ? '已审核银行流水' : 'Reviewed bank statement'}
            <select
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm"
              value={artifactStableId}
              onChange={(event) => {
                setArtifactStableId(event.target.value);
                setPreview(null);
                setScope(null);
                setExcluded(new Set());
              }}
            >
              <option value="">
                {isZh ? '选择已审核 CSV' : 'Select reviewed CSV'}
              </option>
              {reviewed.map((item) => (
                <option
                  key={item.artifactStableId}
                  value={item.artifactStableId}
                >
                  {item.originalFilename ?? item.artifactStableId}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-600">
            {isZh ? '门店 Stable ID' : 'Store stable ID'}
            <input
              list="provider-fee-bank-stores"
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm"
              value={storeStableId}
              onChange={(event) => {
                setStoreStableId(event.target.value);
                setPreview(null);
                setScope(null);
              }}
            />
            <datalist id="provider-fee-bank-stores">
              {knownStoreStableIds.map((store) => (
                <option key={store} value={store} />
              ))}
            </datalist>
          </label>

          <label className="text-xs text-slate-600">
            {isZh ? '扣款银行账户' : 'Bank account'}
            <select
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm"
              value={bankAccountStableId}
              onChange={(event) => {
                setBankAccountStableId(event.target.value);
                setPreview(null);
                setScope(null);
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
                !artifactStableId ||
                !storeStableId.trim() ||
                !bankAccountStableId
              }
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 disabled:opacity-50"
            >
              {busy
                ? isZh
                  ? '分析中…'
                  : 'Analyzing…'
                : isZh
                  ? '加载 Clover 扣款'
                  : 'Load Clover withdrawals'}
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
                {isZh ? '全部扣款行' : 'All withdrawals'}:{' '}
                {preview.source.withdrawalRowCount}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1">
                {isZh ? 'Clover / First Data' : 'Clover / First Data'}:{' '}
                {preview.source.cloverWithdrawalRowCount}
              </span>
              <span
                className={
                  scope?.confirmed
                    ? 'rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800'
                    : 'rounded-full bg-amber-100 px-2.5 py-1 text-amber-800'
                }
              >
                {scope?.confirmed
                  ? isZh
                    ? '扣款范围已确认'
                    : 'Withdrawal scope confirmed'
                  : isZh
                    ? '扣款范围未确认'
                    : 'Withdrawal scope not confirmed'}
              </span>
            </div>

            {preview.withdrawals.length === 0 ? (
              <p className="text-xs text-slate-500">
                {isZh
                  ? '这份流水没有识别到 Clover / First Data 扣款。'
                  : 'No Clover / First Data withdrawals were recognized in this statement.'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-amber-100 bg-white">
                <table className="min-w-[900px] w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-2 py-2">
                        {isZh ? '用于清算' : 'Include'}
                      </th>
                      <th className="px-2 py-2">{isZh ? '日期' : 'Date'}</th>
                      <th className="px-2 py-2 text-right">
                        {isZh ? '扣款金额' : 'Withdrawal'}
                      </th>
                      <th className="px-2 py-2">
                        {isZh ? '银行描述' : 'Bank description'}
                      </th>
                      <th className="px-2 py-2">
                        {isZh ? '状态' : 'Status'}
                      </th>
                      <th className="px-2 py-2">
                        {isZh ? '操作' : 'Action'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.withdrawals.map((row) => {
                      const decision = decisionByRow.get(row.rowNumber);
                      const cleared = decision?.decision === 'CLEARED';
                      return (
                        <tr key={row.rowNumber}>
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={cleared || !excluded.has(row.rowNumber)}
                              disabled={cleared}
                              onChange={(event) => {
                                setExcluded((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) {
                                    next.delete(row.rowNumber);
                                  } else {
                                    next.add(row.rowNumber);
                                  }
                                  return next;
                                });
                                setScope(null);
                              }}
                            />
                          </td>
                          <td className="px-2 py-2">{row.occurredOn}</td>
                          <td className="px-2 py-2 text-right font-semibold">
                            {money(row.amountCents)}
                          </td>
                          <td className="max-w-[360px] px-2 py-2">
                            {row.description ?? '—'}
                          </td>
                          <td className="px-2 py-2">
                            {decision?.decision ?? 'UNCONFIRMED'}
                          </td>
                          <td className="px-2 py-2">
                            {decision?.decision === 'READY_FOR_CLEARING' &&
                            scope?.confirmed ? (
                              <button
                                type="button"
                                disabled={
                                  clearingId === decision.decisionStableId
                                }
                                onClick={() => void clearDecision(decision)}
                                className="rounded bg-amber-700 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50"
                              >
                                {clearingId === decision.decisionStableId
                                  ? isZh
                                    ? '清算中…'
                                    : 'Clearing…'
                                  : isZh
                                    ? '确认银行扣款并清算'
                                    : 'Clear bank withdrawal'}
                              </button>
                            ) : decision?.decision === 'CLEARED' ? (
                              <span className="text-emerald-700">
                                {isZh ? '已清算' : 'Cleared'}
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
            )}

            <button
              type="button"
              onClick={() => void confirmScope()}
              disabled={busy || preview.withdrawals.length === 0}
              className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-950 disabled:opacity-50"
            >
              {isZh ? '确认扣款清算范围' : 'Confirm withdrawal clearing scope'}
            </button>
          </div>
        ) : null}
      </div>
    </details>
  );
}
