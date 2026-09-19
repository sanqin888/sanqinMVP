'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type {
  ProviderSettlementExecutionReport,
  ProviderSettlementShadowPreview,
} from '../contracts/settlements';
import {
  buildProviderSettlementReplayGate,
  type ProviderSettlementReplayGate,
} from './settlement-replay-policy';

const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

type ExecutionState = 'IDLE' | 'EXECUTING' | 'VERIFYING' | 'VERIFIED' | 'UNKNOWN';

type Props = {
  preview: ProviderSettlementShadowPreview;
  documentStableId: string;
  isZh: boolean;
  onPreviewUpdated: (preview: ProviderSettlementShadowPreview) => void;
};

function statusClass(status: ProviderSettlementReplayGate['status']): string {
  if (status === 'READY') return 'bg-amber-100 text-amber-900';
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-800';
  return 'bg-red-100 text-red-800';
}

function freshPreviewPath(preview: ProviderSettlementShadowPreview): string {
  const query = new URLSearchParams({
    fromDate: preview.range.fromDate,
    toDateExclusive: preview.range.toDateExclusive,
    storeStableId: preview.range.storeStableId,
  });
  if (preview.range.provider) query.set('provider', preview.range.provider);
  return `/accounting/journal/provider-settlement/shadow-preview?${query.toString()}`;
}

function executionMatchesAuthorizedPlan(
  execution: ProviderSettlementExecutionReport,
  gate: ProviderSettlementReplayGate,
): boolean {
  return (
    execution.execution.replacementGroupsExecuted === 1 &&
    execution.execution.providerDocumentsPostedOrReplayed === 1 &&
    execution.execution.uberReversalsPostedOrReplayed === gate.summary.reversalJournals &&
    execution.execution.journalEntriesPostedOrReplayed === gate.summary.totalJournals
  );
}

export function SettlementReplayGate({
  preview,
  documentStableId,
  isZh,
  onPreviewUpdated,
}: Props) {
  const gate = useMemo(
    () => buildProviderSettlementReplayGate(preview, documentStableId),
    [documentStableId, preview],
  );
  const [armed, setArmed] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [copyState, setCopyState] = useState<'IDLE' | 'COPIED' | 'FAILED'>('IDLE');
  const [executionState, setExecutionState] = useState<ExecutionState>('IDLE');
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);

  useEffect(() => {
    setArmed(false);
    setConfirmationText('');
    setAcknowledged(false);
    setCopyState('IDLE');
  }, [documentStableId, preview.planHash]);

  const busy = executionState === 'EXECUTING' || executionState === 'VERIFYING';
  const exactConfirmation = confirmationText.trim() === gate.confirmationPhrase;
  const canExecute =
    gate.status === 'READY' &&
    exactConfirmation &&
    acknowledged &&
    !busy &&
    executionState !== 'UNKNOWN';

  async function copyPlanHash() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(preview.planHash);
      setCopyState('COPIED');
    } catch {
      setCopyState('FAILED');
    }
  }

  async function readFreshPreview(): Promise<ProviderSettlementShadowPreview> {
    return apiFetch<ProviderSettlementShadowPreview>(freshPreviewPath(preview));
  }

  async function executeReplay() {
    if (!canExecute) return;

    setExecutionMessage(null);
    setExecutionState('EXECUTING');
    let execution: ProviderSettlementExecutionReport | null = null;
    let postError: string | null = null;

    try {
      execution = await apiFetch<ProviderSettlementExecutionReport>(
        '/accounting/journal/provider-settlement/replay',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromDate: preview.range.fromDate,
            toDateExclusive: preview.range.toDateExclusive,
            storeStableId: preview.range.storeStableId,
            provider: preview.range.provider,
            expectedPlanHash: preview.planHash,
          }),
        },
      );
    } catch (cause) {
      postError = cause instanceof Error ? cause.message : String(cause);
    }

    setExecutionState('VERIFYING');
    try {
      const fresh = await readFreshPreview();
      onPreviewUpdated(fresh);
      const freshGate = buildProviderSettlementReplayGate(fresh, documentStableId);
      if (freshGate.status === 'COMPLETED') {
        const responseMatches =
          execution === null || executionMatchesAuthorizedPlan(execution, gate);
        setExecutionState('VERIFIED');
        setArmed(false);
        setConfirmationText('');
        setAcknowledged(false);
        setExecutionMessage(
          responseMatches
            ? isZh
              ? 'Fresh Shadow Preview 已核对为 ALREADY_POSTED / ALREADY_REVERSED。'
              : 'Fresh Shadow Preview verifies ALREADY_POSTED / ALREADY_REVERSED.'
            : isZh
              ? 'Fresh Preview 显示已完成，但执行响应计数与授权摘要不一致；不要再次执行，请先审阅数据库。'
              : 'Fresh Preview shows completion, but execution counts differed from the authorized summary. Do not execute again; review the database first.',
        );
        return;
      }

      setExecutionState('UNKNOWN');
      setExecutionMessage(
        postError
          ? isZh
            ? `请求没有得到可确认的成功结果（${postError}），且 fresh Preview 未显示完整完成状态。按 UNKNOWN 处理；不要在本页面重试。`
            : `The request did not return a confirmable success (${postError}), and the fresh Preview did not show a complete posted state. Treat the outcome as UNKNOWN and do not retry on this page.`
          : isZh
            ? 'POST 返回后 fresh Preview 没有显示完整完成状态。按 UNKNOWN 处理；不要再次执行，请先审阅数据库。'
            : 'After POST returned, the fresh Preview did not show the complete posted state. Treat the outcome as UNKNOWN; do not execute again before database review.',
      );
    } catch (cause) {
      const refreshError = cause instanceof Error ? cause.message : String(cause);
      setExecutionState('UNKNOWN');
      setExecutionMessage(
        isZh
          ? `写入尝试后无法完成 fresh Preview reconciliation（${refreshError}）。网络失败不代表写入失败；按 UNKNOWN 处理，不要重试。`
          : `Fresh Preview reconciliation failed after the write attempt (${refreshError}). A network failure is not proof that the write failed. Treat the outcome as UNKNOWN and do not retry.`,
      );
    }
  }

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-slate-950">
              {isZh ? '真实 Replay 授权闸门' : 'Real replay authorization gate'}
            </h4>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(gate.status)}`}
            >
              {gate.status}
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-xs text-slate-700">
            {isZh
              ? 'Shadow Preview 本身只读；只有下面的强确认流程才会调用真实 POST writer。此 UI 不提供 Undo，后续修正必须走单独审阅的 revision / compensating Journal 流程。'
              : 'Shadow Preview itself is read-only. Only the strongly confirmed action below calls the real POST writer. This UI has no Undo path; later corrections require a separately reviewed revision or compensating-Journal flow.'}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-slate-950 p-3 text-xs text-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-white">planHash</p>
          <button
            type="button"
            onClick={() => void copyPlanHash()}
            className="rounded border border-slate-600 px-2.5 py-1 text-xs text-white hover:bg-slate-800"
          >
            {copyState === 'COPIED'
              ? isZh
                ? '已复制'
                : 'Copied'
              : copyState === 'FAILED'
                ? isZh
                  ? '复制失败'
                  : 'Copy failed'
                : isZh
                  ? '复制 Hash'
                  : 'Copy hash'}
          </button>
        </div>
        <p className="mt-2 break-all font-mono leading-5">{preview.planHash}</p>
      </div>

      {gate.status !== 'COMPLETED' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-amber-200 bg-white p-3">
            <p className="text-xs text-slate-500">
              {isZh ? '本次写入 Journal' : 'Journals in this write'}
            </p>
            <p className="mt-1 text-xl font-semibold">{gate.summary.totalJournals}</p>
            <p className="mt-1 text-xs text-slate-500">
              {gate.summary.providerDocuments} provider +{' '}
              {gate.summary.reversalJournals} reversals
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-white p-3">
            <p className="text-xs text-slate-500">Provider Journal</p>
            <p className="mt-1 font-semibold">
              {money(gate.summary.providerDebitCents)} /{' '}
              {money(gate.summary.providerCreditCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Debit / Credit</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-white p-3">
            <p className="text-xs text-slate-500">
              {isZh ? '历史 Reversals' : 'Historical reversals'}
            </p>
            <p className="mt-1 font-semibold">
              {money(gate.summary.reversalDebitCents)} /{' '}
              {money(gate.summary.reversalCreditCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Debit / Credit</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-white p-3">
            <p className="text-xs text-slate-500">
              {isZh ? 'Provider Pending 净额' : 'Provider pending net'}
            </p>
            <p className="mt-1 text-xl font-semibold">
              {gate.summary.providerPendingNetCents === null
                ? '—'
                : money(gate.summary.providerPendingNetCents)}
            </p>
          </div>
        </div>
      ) : null}

      {gate.status === 'COMPLETED' ? (
        <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">
            {isZh
              ? 'Fresh Preview 已确认写入完成'
              : 'Fresh Preview confirms completion'}
          </p>
          <p className="mt-1 text-xs">
            {isZh
              ? `Provider Journal 已 ALREADY_POSTED，${gate.summary.reversalJournals} 个历史 reversal 均为 ALREADY_REVERSED。此页面不会再次开放 replay。`
              : `The Provider Journal is ALREADY_POSTED and all ${gate.summary.reversalJournals} historical reversals are ALREADY_REVERSED. Replay is not offered again on this page.`}
          </p>
        </div>
      ) : gate.status === 'BLOCKED' ? (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">
            {isZh ? 'Replay 已锁定' : 'Replay is locked'}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-800">
            {gate.blockReasons.map((reason) => (
              <li key={reason} className="break-all font-mono">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : executionState === 'UNKNOWN' ? (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">UNKNOWN / RECONCILIATION REQUIRED</p>
          <p className="mt-2 text-xs leading-5">{executionMessage}</p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-red-300 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-red-800">REAL JOURNAL WRITE</p>
              <p className="mt-1 text-xs text-slate-600">
                {isZh
                  ? '点击准备不会写账；只有完成确认短语和风险确认后，最终按钮才会发送 POST。'
                  : 'Preparing does not write anything. The final POST is enabled only after the confirmation phrase and risk acknowledgement are complete.'}
              </p>
            </div>
            {!armed ? (
              <button
                type="button"
                onClick={() => setArmed(true)}
                disabled={busy}
                className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isZh ? '准备真实 Replay' : 'Prepare real replay'}
              </button>
            ) : null}
          </div>

          {armed ? (
            <div className="mt-4 space-y-4 border-t border-red-200 pt-4">
              <div>
                <label
                  className="text-sm font-medium text-slate-900"
                  htmlFor={`replay-${documentStableId}`}
                >
                  {isZh ? '输入确认短语' : 'Type the confirmation phrase'}
                </label>
                <p className="mt-1 break-all font-mono text-sm font-semibold text-red-800">
                  {gate.confirmationPhrase}
                </p>
                <input
                  id={`replay-${documentStableId}`}
                  value={confirmationText}
                  onChange={(event) => setConfirmationText(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-slate-100"
                />
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  {isZh
                    ? `我已审阅当前 planHash，并确认本次真实写入是 ${gate.summary.totalJournals} 个 Journal（1 个 provider settlement + ${gate.summary.reversalJournals} 个历史 reversal）。`
                    : `I reviewed the current planHash and confirm this real write contains ${gate.summary.totalJournals} Journals (1 provider settlement + ${gate.summary.reversalJournals} historical reversals).`}
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void executeReplay()}
                  disabled={!canExecute}
                  className="rounded bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {executionState === 'EXECUTING'
                    ? isZh
                      ? '正在提交真实 Replay…'
                      : 'Submitting real replay…'
                    : executionState === 'VERIFYING'
                      ? isZh
                        ? '正在核对写入结果…'
                        : 'Reconciling write result…'
                      : isZh
                        ? `执行真实 Replay（${gate.summary.totalJournals} Journals）`
                        : `Execute real replay (${gate.summary.totalJournals} Journals)`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setArmed(false);
                    setConfirmationText('');
                    setAcknowledged(false);
                  }}
                  disabled={busy}
                  className="rounded border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {executionMessage && executionState !== 'UNKNOWN' ? (
        <p
          className={`mt-3 rounded px-3 py-2 text-xs ${
            executionState === 'VERIFIED'
              ? 'bg-emerald-100 text-emerald-900'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          {executionMessage}
        </p>
      ) : null}
    </section>
  );
}
