'use client';

import { useState } from 'react';

import { apiFetch, getApiErrorMessage } from '@/lib/api/client';
import type { AccountingAuditLog } from '../contracts/audit';
import type {
  AccountingOpeningReceivable,
  AccountingOpeningReceivableReversalResult,
  AccountingOpeningReceivableSettlement,
} from '../contracts/opening-receivables';
import { money } from './opening-receivables-utils';

export function OpeningReceivableDetail({
  detail,
  auditLogs,
  isZh,
  onRefresh,
  onCreateSettlement,
  onCorrectOpeningReceivable,
  onCorrectSettlement,
}: {
  detail: AccountingOpeningReceivable;
  auditLogs: AccountingAuditLog[];
  isZh: boolean;
  onRefresh: () => Promise<void>;
  onCreateSettlement: (openingReceivableStableId: string) => void;
  onCorrectOpeningReceivable: () => void;
  onCorrectSettlement: (
    settlement: AccountingOpeningReceivableSettlement,
  ) => void;
}) {
  const [openingReason, setOpeningReason] = useState('');
  const [settlementReasons, setSettlementReasons] = useState<
    Record<string, string>
  >({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const liveSettlements = detail.settlements.filter(
    (settlement) => !settlement.reversedAt,
  );

  const reverse = async (
    target: 'OPENING_RECEIVABLE' | 'SETTLEMENT',
    stableId: string,
    reason: string,
    correct: boolean,
    settlement?: AccountingOpeningReceivableSettlement,
  ) => {
    if (!reason.trim()) {
      setFeedback(
        isZh ? '冲销必须填写原因。' : 'A reversal reason is required.',
      );
      return;
    }

    setBusyKey(stableId);
    setFeedback(null);
    const path =
      target === 'OPENING_RECEIVABLE'
        ? `/accounting/opening-receivables/${encodeURIComponent(stableId)}/reverse`
        : `/accounting/opening-receivables/settlements/${encodeURIComponent(stableId)}/reverse`;

    try {
      await apiFetch<AccountingOpeningReceivableReversalResult>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await onRefresh();
      if (correct) {
        if (target === 'OPENING_RECEIVABLE') {
          onCorrectOpeningReceivable();
        } else if (settlement) {
          onCorrectSettlement(settlement);
        }
      }
    } catch (error) {
      setFeedback(
        getApiErrorMessage(error, isZh ? '冲销失败。' : 'Reversal failed.'),
      );
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{detail.counterpartyName}</h2>
            <Status value={detail.status} />
          </div>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">
            {detail.openingReceivableStableId}
          </p>
        </div>
        {detail.status !== 'REVERSED' && detail.outstandingAmountCents > 0 ? (
          <button
            type="button"
            onClick={() =>
              onCreateSettlement(detail.openingReceivableStableId)
            }
            className="min-h-10 rounded-xl border border-[#87362E]/30 px-3 py-2 text-sm font-semibold text-[#762f28]"
          >
            {isZh ? '登记回款' : 'Record collection'}
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label={isZh ? '期初应收' : 'Opening AR'}
          value={money(detail.openingAmountCents)}
        />
        <Metric
          label={isZh ? '有效已收' : 'Live collected'}
          value={money(detail.settledAmountCents)}
        />
        <Metric
          label={isZh ? '未结应收' : 'Outstanding'}
          value={money(detail.outstandingAmountCents)}
        />
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label="Opening date" value={detail.openingDate} />
        <Info
          label={isZh ? '参考号' : 'Reference'}
          value={detail.reference ?? '—'}
        />
        <Info
          label="Canonical Journal"
          value={detail.journalEntryStableId}
          mono
        />
        {detail.replacementForOpeningReceivableStableId ? (
          <Info
            label={isZh ? '替代前序期初应收' : 'Replaces opening AR'}
            value={detail.replacementForOpeningReceivableStableId}
            mono
          />
        ) : null}
        {detail.replacedByOpeningReceivableStableId ? (
          <Info
            label={isZh ? '已被替代为' : 'Replaced by'}
            value={detail.replacedByOpeningReceivableStableId}
            mono
          />
        ) : null}
        {detail.reversalJournalEntryStableId ? (
          <Info
            label={isZh ? '冲销 Journal' : 'Reversal Journal'}
            value={detail.reversalJournalEntryStableId}
            mono
          />
        ) : null}
      </div>

      <details open className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer font-semibold">
          {isZh
            ? `回款历史（${detail.settlements.length}）`
            : `Collection history (${detail.settlements.length})`}
        </summary>
        <div className="mt-3 space-y-3">
          {detail.settlements.map((settlement) => {
            const reason =
              settlementReasons[settlement.settlementStableId] ?? '';
            return (
              <div
                key={settlement.settlementStableId}
                className="rounded-xl bg-slate-50 p-3"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {settlement.settlementOn} ·{' '}
                      {settlement.collectionAccountStableId}
                    </p>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                      {settlement.settlementStableId}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {money(settlement.amountCents)}
                    </p>
                    <span className="text-xs text-slate-500">
                      {settlement.reversedAt ? 'REVERSED' : 'POSTED'}
                    </span>
                  </div>
                </div>

                {settlement.replacedBySettlementStableId ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {isZh ? '已被替代：' : 'Replaced by: '}
                    {settlement.replacedBySettlementStableId}
                  </p>
                ) : null}

                {settlement.reversedAt ? (
                  !settlement.replacedBySettlementStableId ? (
                    <button
                      type="button"
                      onClick={() => onCorrectSettlement(settlement)}
                      className="mt-3 rounded-xl border px-3 py-2 text-sm font-semibold"
                    >
                      {isZh
                        ? '用原回款预填订正'
                        : 'Prefill corrected collection'}
                    </button>
                  ) : null
                ) : (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={reason}
                      onChange={(event) =>
                        setSettlementReasons((current) => ({
                          ...current,
                          [settlement.settlementStableId]: event.target.value,
                        }))
                      }
                      placeholder={
                        isZh ? '必填：冲销原因' : 'Required: reversal reason'
                      }
                      className="min-h-16 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyKey === settlement.settlementStableId}
                        onClick={() =>
                          void reverse(
                            'SETTLEMENT',
                            settlement.settlementStableId,
                            reason,
                            false,
                            settlement,
                          )
                        }
                        className="rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
                      >
                        {isZh ? '冲销回款' : 'Reverse collection'}
                      </button>
                      <button
                        type="button"
                        disabled={busyKey === settlement.settlementStableId}
                        onClick={() =>
                          void reverse(
                            'SETTLEMENT',
                            settlement.settlementStableId,
                            reason,
                            true,
                            settlement,
                          )
                        }
                        className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {isZh ? '冲销并订正' : 'Reverse & correct'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>

      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer font-semibold">
          {isZh ? '审计记录' : 'Audit history'}
        </summary>
        <div className="mt-3 space-y-2">
          {auditLogs.map((log, index) => (
            <div
              key={`${log.action}-${log.createdAt}-${index}`}
              className="rounded-lg bg-slate-50 p-3 text-xs"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">{log.action}</span>
                <span className="text-slate-500">
                  {new Date(log.createdAt).toLocaleString(
                    isZh ? 'zh-CN' : 'en-CA',
                  )}
                </span>
              </div>
              <p className="mt-1 text-slate-500">{log.operatorActorRef}</p>
            </div>
          ))}
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-500">
              {isZh ? '没有审计记录。' : 'No audit records.'}
            </p>
          ) : null}
        </div>
      </details>

      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <h3 className="font-semibold text-red-900">
          {isZh ? '冲销 / 订正期初应收' : 'Reverse / correct Opening AR'}
        </h3>
        <p className="mt-1 text-sm leading-6 text-red-800">
          {isZh
            ? '已入账事实不会原地编辑。必须先逐笔冲销所有有效回款；Opening AR 冲销会追加原 canonical Journal 的 exact-inverse。'
            : 'Posted facts are never edited in place. Reverse every live collection first; Opening AR reversal appends an exact inverse of the original canonical Journal.'}
        </p>

        {detail.reversedAt ? (
          !detail.replacedByOpeningReceivableStableId ? (
            <button
              type="button"
              onClick={onCorrectOpeningReceivable}
              className="mt-3 rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800"
            >
              {isZh
                ? '用原事实预填替代期初应收'
                : 'Prefill replacement from original'}
            </button>
          ) : null
        ) : (
          <div className="mt-3 space-y-3">
            {liveSettlements.length > 0 ? (
              <p className="text-sm font-medium text-red-800">
                {isZh
                  ? `还有 ${liveSettlements.length} 条有效回款，后端会拒绝直接冲销期初应收。`
                  : `${liveSettlements.length} live collection(s) must be reversed first.`}
              </p>
            ) : null}

            <textarea
              value={openingReason}
              onChange={(event) => setOpeningReason(event.target.value)}
              placeholder={
                isZh ? '必填：冲销原因' : 'Required: reversal reason'
              }
              className="min-h-20 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  busyKey === detail.openingReceivableStableId ||
                  liveSettlements.length > 0
                }
                onClick={() =>
                  void reverse(
                    'OPENING_RECEIVABLE',
                    detail.openingReceivableStableId,
                    openingReason,
                    false,
                  )
                }
                className="rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
              >
                {isZh ? '仅冲销' : 'Reverse only'}
              </button>
              <button
                type="button"
                disabled={
                  busyKey === detail.openingReceivableStableId ||
                  liveSettlements.length > 0
                }
                onClick={() =>
                  void reverse(
                    'OPENING_RECEIVABLE',
                    detail.openingReceivableStableId,
                    openingReason,
                    true,
                  )
                }
                className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isZh ? '冲销并开始订正' : 'Reverse & start correction'}
              </button>
            </div>
          </div>
        )}
      </div>

      {feedback ? (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm">{feedback}</p>
      ) : null}
    </section>
  );
}

function Status({ value }: { value: AccountingOpeningReceivable['status'] }) {
  const className =
    value === 'OPEN'
      ? 'bg-amber-100 text-amber-900'
      : value === 'PARTIALLY_SETTLED'
        ? 'bg-blue-100 text-blue-900'
        : value === 'SETTLED'
          ? 'bg-emerald-100 text-emerald-900'
          : 'bg-slate-200 text-slate-700';

  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-semibold ${className}`}
    >
      {value}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Info({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={
          mono
            ? 'mt-1 break-all font-mono text-xs text-slate-800'
            : 'mt-1 break-words font-medium text-slate-800'
        }
      >
        {value}
      </p>
    </div>
  );
}
