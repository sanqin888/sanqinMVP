'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AccountingFinancialProvider } from '../contracts/core';
import type {
  AccountingProviderCoverageStatus,
  AccountingProviderPendingReconciliationReport,
  AccountingProviderPendingWarning,
} from '../contracts/provider-pending-reconciliation';

const money = (cents: number): string =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

const providerLabel = (
  provider: AccountingFinancialProvider,
  isZh: boolean,
): string => {
  if (provider === 'UBER_EATS') return 'Uber Eats';
  if (provider === 'FANTUAN') return isZh ? '饭团' : 'Fantuan';
  return 'Clover';
};

const coverageClass = (status: AccountingProviderCoverageStatus): string => {
  if (status === 'COMPLETE') return 'bg-emerald-100 text-emerald-800';
  if (status === 'INCOMPLETE') return 'bg-amber-100 text-amber-800';
  if (status === 'NOT_APPLICABLE') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-700';
};

const coverageLabel = (
  status: AccountingProviderCoverageStatus,
  isZh: boolean,
): string => {
  if (status === 'COMPLETE') {
    return isZh ? 'Provider coverage 完整' : 'Provider coverage complete';
  }
  if (status === 'INCOMPLETE') {
    return isZh ? 'Provider coverage 未完整' : 'Provider coverage incomplete';
  }
  if (status === 'NOT_APPLICABLE') {
    return isZh
      ? 'Provider coverage 不适用'
      : 'Provider coverage not applicable';
  }
  return isZh ? 'Provider coverage 未知' : 'Provider coverage unknown';
};

const warningLabel = (
  warning: AccountingProviderPendingWarning,
  isZh: boolean,
): string => {
  if (warning === 'NEGATIVE_PENDING_BALANCE') {
    return isZh
      ? '期末 Pending 为负数：可能存在到账先于 provider economics 入账、缺失结算资料或需要进一步核查。'
      : 'Closing Pending is negative. Bank receipt timing may lead provider economics posting, or settlement evidence may be missing.';
  }
  if (warning === 'OTHER_LEDGER_MOVEMENT_PRESENT') {
    return isZh
      ? '存在未归入 Order / Statement / authority adjustment / payout 的 Pending Journal movement。'
      : 'Pending contains Journal movement outside Order, Statement, authority adjustment, or payout buckets.';
  }
  if (warning === 'PAYOUT_DIRECTION_UNEXPECTED') {
    return isZh
      ? '检测到 payout 对 Pending 的方向异常。'
      : 'A payout moved Provider Pending in an unexpected direction.';
  }
  return warning;
};

export function ProviderPendingReconciliationPanel({
  isZh,
  knownStoreStableIds,
}: {
  isZh: boolean;
  knownStoreStableIds: string[];
}) {
  const [storeStableId, setStoreStableId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [report, setReport] =
    useState<AccountingProviderPendingReconciliationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (params: { storeStableId: string; from?: string; to?: string }) => {
      const store = params.storeStableId.trim();
      if (!store) return;
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ storeStableId: store });
        if (params.from) query.set('from', params.from);
        if (params.to) query.set('to', params.to);
        const next =
          await apiFetch<AccountingProviderPendingReconciliationReport>(
            `/accounting/provider-pending-reconciliation?${query.toString()}`,
          );
        setReport(next);
        setFromDate(next.effectiveFrom);
        setToDate(next.effectiveTo);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!storeStableId && knownStoreStableIds.length > 0) {
      const store = knownStoreStableIds[0];
      setStoreStableId(store);
      void load({ storeStableId: store });
    }
  }, [knownStoreStableIds, load, storeStableId]);

  function refresh(event: FormEvent) {
    event.preventDefault();
    if (!storeStableId.trim()) {
      setError(isZh ? '请输入门店 Stable ID。' : 'Enter the store stable ID.');
      return;
    }
    void load({
      storeStableId,
      ...(fromDate ? { from: fromDate } : {}),
      ...(toDate ? { to: toDate } : {}),
    });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">
          {isZh ? 'Provider Pending 对账' : 'Provider Pending reconciliation'}
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-slate-600">
          {isZh
            ? '这是 canonical Journal 的 Pending roll-forward：期初 + Order + Provider Statement + authority adjustment + 其他 − 实际到账 = 期末 Pending。它验证内部账本可解释性，不代表银行或平台已经提供独立的期末余额确认。'
            : 'This is a canonical Journal Pending roll-forward: opening + Orders + Provider Statements + authority adjustments + other movement − actual payouts = closing Pending. It validates internal ledger explainability, not an externally confirmed bank/provider closing balance.'}
        </p>
      </div>

      <form
        className="grid gap-3 rounded-xl border border-violet-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4"
        onSubmit={refresh}
      >
        <label className="text-xs text-slate-600 xl:col-span-2">
          {isZh ? '门店 Stable ID' : 'Store stable ID'}
          <input
            list="provider-pending-reconciliation-stores"
            className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
            value={storeStableId}
            onChange={(event) => {
              setStoreStableId(event.target.value);
              setReport(null);
              setError(null);
            }}
            placeholder="4750_Yonge_Street"
          />
          <datalist id="provider-pending-reconciliation-stores">
            {knownStoreStableIds.map((store) => (
              <option key={store} value={store} />
            ))}
          </datalist>
        </label>

        <label className="text-xs text-slate-600">
          {isZh ? '起始日期' : 'From'}
          <input
            type="date"
            className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>

        <label className="text-xs text-slate-600">
          {isZh ? '截止日期' : 'To'}
          <input
            type="date"
            className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>

        <div className="sm:col-span-2 xl:col-span-4">
          <button
            disabled={loading || !storeStableId.trim()}
            className="rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-medium text-violet-900 disabled:opacity-50"
          >
            {loading
              ? isZh
                ? '正在对账…'
                : 'Reconciling…'
              : isZh
                ? '刷新 Pending 对账'
                : 'Refresh Pending reconciliation'}
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {report ? (
        <>
          <div className="rounded-xl border border-violet-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">
                  {isZh ? '有效期间' : 'Effective period'}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {report.effectiveFrom} → {report.effectiveTo}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">
                  {isZh ? '全部 Provider 期末 Pending' : 'Total closing Pending'}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {money(report.totals.closingBalanceCents)}
                </p>
              </div>
              <span
                className={
                  report.totals.arithmeticDeltaCents === 0
                    ? 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800'
                    : 'rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800'
                }
              >
                {report.totals.arithmeticDeltaCents === 0
                  ? isZh
                    ? '内部 roll-forward 平衡'
                    : 'Internal roll-forward balanced'
                  : isZh
                    ? '内部算术不平衡'
                    : 'Internal arithmetic mismatch'}
              </span>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {report.providers.map((row) => (
              <article
                key={row.provider}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">
                      {providerLabel(row.provider, isZh)}
                    </h3>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      {row.pendingAccountStableId}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${coverageClass(
                      row.coverage.status,
                    )}`}
                  >
                    {coverageLabel(row.coverage.status, isZh)}
                  </span>
                </div>

                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">
                      {isZh ? '期初 Pending' : 'Opening Pending'}
                    </dt>
                    <dd className="font-medium">{money(row.openingBalanceCents)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">
                      + {isZh ? 'Canonical Order' : 'Canonical Orders'}
                    </dt>
                    <dd>{money(row.canonicalOrderMovementCents)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">+ Provider Statement</dt>
                    <dd>{money(row.providerStatementMovementCents)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">
                      + {isZh ? 'Authority 调整' : 'Authority adjustments'}
                    </dt>
                    <dd>{money(row.authorityAdjustmentMovementCents)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">
                      + {isZh ? '其他 movement' : 'Other movement'}
                    </dt>
                    <dd>{money(row.otherMovementCents)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">
                      − {isZh ? '实际到账' : 'Actual payouts'}
                    </dt>
                    <dd>{money(row.payoutReductionCents)}</dd>
                  </div>
                  <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2">
                    <dt className="font-semibold">
                      = {isZh ? '期末 Pending' : 'Closing Pending'}
                    </dt>
                    <dd
                      className={
                        row.closingBalanceCents < 0
                          ? 'font-semibold text-red-700'
                          : 'font-semibold text-slate-900'
                      }
                    >
                      {money(row.closingBalanceCents)}
                    </dd>
                  </div>
                </dl>

                <p className="text-[11px] text-slate-500">
                  {isZh
                    ? `Entries：Order ${row.entryCounts.canonicalOrder} / Statement ${row.entryCounts.providerStatement} / Authority ${row.entryCounts.authorityAdjustment} / Payout ${row.entryCounts.payout} / Other ${row.entryCounts.other}`
                    : `Entries: Order ${row.entryCounts.canonicalOrder} / Statement ${row.entryCounts.providerStatement} / Authority ${row.entryCounts.authorityAdjustment} / Payout ${row.entryCounts.payout} / Other ${row.entryCounts.other}`}
                </p>

                {row.coverage.financialHistoryRequiredFrom ? (
                  <p className="text-[11px] text-slate-500">
                    {isZh ? 'Provider history required from' : 'Provider history required from'}:{' '}
                    {row.coverage.financialHistoryRequiredFrom}
                    {' · '}
                    {isZh ? 'complete through' : 'complete through'}:{' '}
                    {row.coverage.financialCompleteThrough ?? '—'}
                  </p>
                ) : null}

                {row.warnings.length > 0 ? (
                  <div className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {row.warnings.map((warning) => (
                      <p key={warning}>{warningLabel(warning, isZh)}</p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
