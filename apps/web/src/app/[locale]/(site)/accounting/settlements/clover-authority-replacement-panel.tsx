'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { CloverAuthorityReplacementPreview } from '../contracts/settlements';

const money = (cents: number | null | undefined) =>
  cents == null ? '—' : `$${(cents / 100).toFixed(2)}`;

const CONFIRMATION_PHRASE = 'POST CLOVER HISTORICAL AUTHORITY';

function statusClass(status: CloverAuthorityReplacementPreview['status']) {
  if (status === 'ALREADY_POSTED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'READY_FOR_HUMAN_REVIEW') {
    return 'bg-amber-100 text-amber-900';
  }
  return 'bg-red-100 text-red-800';
}

export function CloverAuthorityReplacementPanel({
  storeStableId,
  isZh,
}: {
  storeStableId: string;
  isZh: boolean;
}) {
  const [preview, setPreview] =
    useState<CloverAuthorityReplacementPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [armed, setArmed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [executionState, setExecutionState] = useState<
    'IDLE' | 'EXECUTING' | 'VERIFIED' | 'UNKNOWN'
  >('IDLE');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const query = new URLSearchParams({ storeStableId });
      const next = await apiFetch<CloverAuthorityReplacementPreview>(
        `/accounting/report/clover-authority-replacement-preview?${query.toString()}`,
      );
      setPreview(next);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [storeStableId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setArmed(false);
    setAcknowledged(false);
    setConfirmationText('');
    setExecutionState('IDLE');
  }, [preview?.planHash]);

  async function execute() {
    if (
      !preview ||
      preview.status !== 'READY_FOR_HUMAN_REVIEW' ||
      confirmationText.trim() !== CONFIRMATION_PHRASE ||
      !acknowledged ||
      executionState === 'EXECUTING'
    ) {
      return;
    }

    setExecutionState('EXECUTING');
    setMessage(null);
    let postError: string | null = null;
    try {
      await apiFetch(
        '/accounting/journal/clover-authority-replacement',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeStableId,
            expectedPlanHash: preview.planHash,
          }),
        },
      );
    } catch (cause) {
      postError = cause instanceof Error ? cause.message : String(cause);
    }

    try {
      const query = new URLSearchParams({ storeStableId });
      const fresh = await apiFetch<CloverAuthorityReplacementPreview>(
        `/accounting/report/clover-authority-replacement-preview?${query.toString()}`,
      );
      setPreview(fresh);
      if (fresh.status === 'ALREADY_POSTED') {
        setExecutionState('VERIFIED');
        setMessage(
          isZh
            ? `Fresh Preview 已确认 ${fresh.totals.alreadyPostedPeriods} 个历史 authority period 全部 ALREADY_POSTED。`
            : `Fresh preview confirms all ${fresh.totals.alreadyPostedPeriods} historical authority periods are ALREADY_POSTED.`,
        );
        return;
      }
      setExecutionState('UNKNOWN');
      setMessage(
        postError
          ? isZh
            ? `POST 未得到可确认结果（${postError}），且 fresh Preview 未显示 ALREADY_POSTED。按 UNKNOWN 处理，不要再次提交。`
            : `POST did not return a confirmable result (${postError}) and fresh preview is not ALREADY_POSTED. Treat this as UNKNOWN and do not submit again.`
          : isZh
            ? 'POST 返回后 fresh Preview 未显示 ALREADY_POSTED。按 UNKNOWN 处理，不要再次提交。'
            : 'Fresh preview is not ALREADY_POSTED after POST. Treat this as UNKNOWN and do not submit again.',
      );
    } catch (cause) {
      setExecutionState('UNKNOWN');
      setMessage(
        isZh
          ? `写入尝试后无法完成 fresh Preview reconciliation（${cause instanceof Error ? cause.message : String(cause)}）。不要重试。`
          : `Fresh preview reconciliation failed after the write attempt (${cause instanceof Error ? cause.message : String(cause)}). Do not retry.`,
      );
    }

  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        {isZh ? '正在读取 Clover 历史 authority replacement…' : 'Loading Clover historical authority replacement…'}
      </section>
    );
  }

  if (!preview) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p>{message ?? (isZh ? '无法读取历史修正计划。' : 'Unable to load the historical correction plan.')}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded border border-red-300 bg-white px-3 py-2"
        >
          {isZh ? '重试' : 'Retry'}
        </button>
      </section>
    );
  }

  const canExecute =
    preview.status === 'READY_FOR_HUMAN_REVIEW' &&
    acknowledged &&
    confirmationText.trim() === CONFIRMATION_PHRASE &&
    executionState !== 'EXECUTING' &&
    executionState !== 'UNKNOWN';

  return (
    <section className="space-y-4 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">
              {isZh ? 'Clover 历史 authority replacement' : 'Clover historical authority replacement'}
            </h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(preview.status)}`}>
              {preview.status}
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-xs text-slate-600">
            {isZh
              ? '历史修正只使用经过 Closeout controls 验证的 provider evidence。June surcharge 来自 Clover Dashboard Sales Report；July surcharge 来自 Monthly Statement。'
              : 'Historical correction uses only provider evidence validated against Closeout controls. June surcharge comes from the Clover Dashboard Sales Report; July surcharge comes from the Monthly Statement.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {isZh ? '刷新' : 'Refresh'}
        </button>
      </div>

      {preview.globalIssues.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {preview.globalIssues.map((issue) => (
            <div key={issue} className="font-mono">{issue}</div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{isZh ? 'Provider principal' : 'Provider principal'}</p>
          <p className="mt-1 text-lg font-semibold">{money(preview.totals.providerPrincipalCents)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Order Clover Pending</p>
          <p className="mt-1 text-lg font-semibold">{money(preview.totals.orderPendingMovementCents)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{isZh ? 'Authority 调整' : 'Authority adjustment'}</p>
          <p className="mt-1 text-lg font-semibold">{money(preview.totals.proposedPendingAuthorityAdjustmentCents)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{isZh ? 'Periods' : 'Periods'}</p>
          <p className="mt-1 text-sm font-semibold">
            {preview.totals.readyPeriods} READY / {preview.totals.alreadyPostedPeriods} POSTED / {preview.totals.blockedPeriods} BLOCKED
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {preview.periods.map((period) => (
          <details
            key={period.statementDocumentStableId}
            open={period.proposal.status !== 'ALREADY_POSTED'}
            className="rounded-xl border border-slate-200 p-4"
          >
            <summary className="cursor-pointer text-sm font-semibold">
              {period.authorityWindow.from} → {period.authorityWindow.to} · {period.proposal.status}
            </summary>
            <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-slate-500">Pending delta</p>
                <p className="font-semibold">{money(period.proposal.pendingAuthorityDeltaCents)}</p>
              </div>
              <div>
                <p className="text-slate-500">Tips</p>
                <p className="font-semibold">{money(period.proposal.missingTipRevenueCents)}</p>
              </div>
              <div>
                <p className="text-slate-500">Surcharge</p>
                <p className="font-semibold">{money(period.proposal.missingSurchargeRevenueCents)}</p>
                <p className="font-mono text-[10px] text-slate-500">
                  {period.providerEvidence.surchargeAuthority}
                  {period.providerEvidence.surchargeSource
                    ? ` · ${period.providerEvidence.surchargeSource}`
                    : ''}
                </p>
                <p className="break-all font-mono text-[10px] text-slate-400">
                  {period.providerEvidence.surchargeSourceDocumentStableId ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Store Cash reclass</p>
                <p className="font-semibold">{money(period.proposal.storeCashReclassificationCents)}</p>
              </div>
              <div>
                <p className="text-slate-500">{isZh ? '实际期末 Pending' : 'Actual closing Pending'}</p>
                <p className="font-semibold">{money(period.pendingRollForward.actualClosingCents)}</p>
              </div>
              <div>
                <p className="text-slate-500">{isZh ? '修正后模拟期末' : 'Simulated closing after correction'}</p>
                <p className="font-semibold">{money(period.pendingRollForward.simulatedProviderAuthorityClosingCents)}</p>
              </div>
              <div>
                <p className="text-slate-500">Journal</p>
                <p className="break-all font-mono text-[10px]">
                  {period.proposal.existingJournalEntryStableId ?? '—'}
                </p>
              </div>
            </div>

            {period.proposal.blockReasons.length > 0 ? (
              <div className="mt-3 rounded bg-red-50 p-3 text-xs text-red-800">
                {period.proposal.blockReasons.join(', ')}
              </div>
            ) : null}

            {period.proposal.draftJournal ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[720px] w-full text-left text-xs">
                  <thead className="border-b text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Account</th>
                      <th className="px-2 py-2 text-right">Debit</th>
                      <th className="px-2 py-2 text-right">Credit</th>
                      <th className="px-2 py-2">Memo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {period.proposal.draftJournal.lines.map((line) => (
                      <tr key={`${line.accountStableId}-${line.debitCents ?? 0}-${line.creditCents ?? 0}`}>
                        <td className="px-2 py-2 font-mono text-[11px]">{line.accountStableId}</td>
                        <td className="px-2 py-2 text-right">{money(line.debitCents ?? 0)}</td>
                        <td className="px-2 py-2 text-right">{money(line.creditCents ?? 0)}</td>
                        <td className="px-2 py-2 text-slate-600">{line.memo ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </details>
        ))}
      </div>

      <div className="rounded-xl bg-slate-950 p-3 text-xs text-slate-200">
        <p className="font-semibold text-white">planHash</p>
        <p className="mt-1 break-all font-mono">{preview.planHash}</p>
      </div>

      {preview.status === 'ALREADY_POSTED' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {isZh
            ? 'Fresh Preview 已确认全部历史 authority adjustment 入账完成。'
            : 'Fresh preview confirms all historical authority adjustments are posted.'}
        </div>
      ) : preview.status === 'BLOCKED' ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {isZh ? '当前计划 BLOCKED，不开放真实写入。' : 'The current plan is BLOCKED; real posting is disabled.'}
        </div>
      ) : executionState === 'UNKNOWN' ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">UNKNOWN / RECONCILIATION REQUIRED</p>
          <p className="mt-2 text-xs">{message}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          {!armed ? (
            <button
              type="button"
              onClick={() => setArmed(true)}
              className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white"
            >
              {isZh ? '准备真实历史修正' : 'Prepare real historical correction'}
            </button>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-600">{isZh ? '输入确认短语：' : 'Type the confirmation phrase:'}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-red-800">{CONFIRMATION_PHRASE}</p>
                <input
                  value={confirmationText}
                  onChange={(event) => setConfirmationText(event.target.value)}
                  className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <label className="flex items-start gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  {isZh
                    ? '我已核对 June Sales Report / July Statement 的 surcharge evidence、tender reclassification 和 draft Journal，并确认该写入没有 Undo。'
                    : 'I reviewed the June Sales Report / July Statement surcharge evidence, tender reclassification, and draft Journals, and understand this write has no Undo.'}
                </span>
              </label>
              <button
                type="button"
                disabled={!canExecute}
                onClick={() => void execute()}
                className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {executionState === 'EXECUTING'
                  ? isZh
                    ? '写入并核对中…'
                    : 'Posting and reconciling…'
                  : isZh
                    ? '执行真实 Historical Authority Posting'
                    : 'Execute historical authority posting'}
              </button>
            </div>
          )}
        </div>
      )}

      {message && executionState !== 'UNKNOWN' ? (
        <p className="text-xs text-slate-600">{message}</p>
      ) : null}
    </section>
  );
}
