'use client';

import { useState } from 'react';

import { apiFetch, getApiErrorMessage } from '@/lib/api/client';
import type { AccountingAuditLog } from '../contracts/audit';
import type {
  AccountingExternalSaleDetail,
  AccountingExternalSaleReversalResult,
  AccountingExternalSaleSettlement,
} from '../contracts/external-sales';
import { ExternalSaleSettlementCard } from './external-sale-settlement-card';
import { money } from './external-sales-utils';

function statusClass(status: AccountingExternalSaleDetail['status']) {
  if (status === 'OPEN') return 'bg-amber-100 text-amber-900';
  if (status === 'PARTIALLY_SETTLED') return 'bg-blue-100 text-blue-900';
  if (status === 'SETTLED') return 'bg-emerald-100 text-emerald-900';
  return 'bg-slate-200 text-slate-700';
}

export function ExternalSaleDetail({
  detail,
  auditLogs,
  isZh,
  onRefresh,
  onCreateSettlement,
  onCorrectSale,
  onCorrectSettlement,
}: {
  detail: AccountingExternalSaleDetail;
  auditLogs: AccountingAuditLog[];
  isZh: boolean;
  onRefresh: () => Promise<void>;
  onCreateSettlement: (externalSaleStableId: string) => void;
  onCorrectSale: (detail: AccountingExternalSaleDetail) => void;
  onCorrectSettlement: (settlement: AccountingExternalSaleSettlement) => void;
}) {
  const [saleReason, setSaleReason] = useState('');
  const [settlementReasons, setSettlementReasons] = useState<
    Record<string, string>
  >({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const liveSettlements = detail.settlements.filter(
    (settlement) => !settlement.reversedAt,
  );

  const reverseSale = async (correct: boolean) => {
    if (!saleReason.trim()) {
      setFeedback(
        isZh ? '冲销必须填写原因。' : 'A reversal reason is required.',
      );
      return;
    }
    setBusyKey('sale');
    setFeedback(null);
    try {
      await apiFetch<AccountingExternalSaleReversalResult>(
        `/accounting/external-sales/${encodeURIComponent(detail.externalSaleStableId)}/reverse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: saleReason.trim() }),
        },
      );
      await onRefresh();
      if (correct) onCorrectSale(detail);
    } catch (error) {
      setFeedback(
        getApiErrorMessage(
          error,
          isZh ? '销售冲销失败。' : 'Failed to reverse external sale.',
        ),
      );
    } finally {
      setBusyKey(null);
    }
  };

  const reverseSettlement = async (
    settlement: AccountingExternalSaleSettlement,
    correct: boolean,
  ) => {
    const reason = settlementReasons[settlement.settlementStableId]?.trim();
    if (!reason) {
      setFeedback(
        isZh ? '冲销必须填写原因。' : 'A reversal reason is required.',
      );
      return;
    }
    setBusyKey(settlement.settlementStableId);
    setFeedback(null);
    try {
      await apiFetch<AccountingExternalSaleReversalResult>(
        `/accounting/external-sales/settlements/${encodeURIComponent(settlement.settlementStableId)}/reverse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      );
      await onRefresh();
      if (correct) onCorrectSettlement(settlement);
    } catch (error) {
      setFeedback(
        getApiErrorMessage(
          error,
          isZh ? '结算冲销失败。' : 'Failed to reverse settlement.',
        ),
      );
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">
              {detail.counterpartyName}
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(detail.status)}`}
            >
              {detail.status}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
              {detail.classificationStableId}
            </span>
          </div>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">
            {detail.externalSaleStableId}
          </p>
        </div>
        {detail.status !== 'REVERSED' && detail.outstandingCents > 0 ? (
          <button
            type="button"
            onClick={() => onCreateSettlement(detail.externalSaleStableId)}
            className="min-h-10 rounded-xl border border-[#87362E]/30 px-3 py-2 text-sm font-semibold text-[#762f28]"
          >
            {isZh ? '登记回款 / 扣费' : 'Record settlement'}
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={isZh ? '原始应收' : 'Original receivable'}
          value={money(detail.totalReceivableCents)}
        />
        <Metric
          label={isZh ? '有效已结算' : 'Live settled'}
          value={money(detail.settledCents)}
        />
        <Metric
          label={isZh ? '未结应收' : 'Outstanding AR'}
          value={money(detail.outstandingCents)}
        />
        <Metric
          label={isZh ? '发生日期' : 'Occurred on'}
          value={detail.occurredOn}
        />
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Info
          label={isZh ? '证据粒度' : 'Evidence granularity'}
          value={detail.granularity}
        />
        <Info
          label={isZh ? '参考号' : 'Reference'}
          value={detail.reference ?? '—'}
        />
        <Info
          label={isZh ? 'Canonical Journal' : 'Canonical Journal'}
          value={detail.journalEntryStableId}
          mono
        />
        <Info
          label={isZh ? '创建时间' : 'Created at'}
          value={new Date(detail.createdAt).toLocaleString(
            isZh ? 'zh-CN' : 'en-CA',
          )}
        />
        {detail.replacementForExternalSaleStableId ? (
          <Info
            label={isZh ? '替代前序销售' : 'Replaces sale'}
            value={detail.replacementForExternalSaleStableId}
            mono
          />
        ) : null}
        {detail.replacedByExternalSaleStableId ? (
          <Info
            label={isZh ? '已被替代为' : 'Replaced by'}
            value={detail.replacedByExternalSaleStableId}
            mono
          />
        ) : null}
        {detail.reversalStableId ? (
          <Info
            label={isZh ? '冲销事实' : 'Reversal fact'}
            value={detail.reversalStableId}
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

      {detail.periodStartOn || detail.periodEndOn ? (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {isZh ? '证据期间：' : 'Evidence period: '}
          {detail.periodStartOn ?? '—'} → {detail.periodEndOn ?? '—'}
        </p>
      ) : null}
      {detail.note ? (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {detail.note}
        </p>
      ) : null}

      {detail.evidence?.length ? (
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="font-semibold">
            {isZh ? '原始证据' : 'Source evidence'}
          </p>
          <div className="mt-2 space-y-2">
            {(detail.evidence ?? []).map((evidence) => (
              <div
                key={evidence.evidenceStableId}
                className="rounded-lg bg-slate-50 p-3 text-xs"
              >
                <p className="font-medium">
                  {evidence.originalFilename ?? evidence.artifactStableId}
                </p>
                <p className="mt-1 break-all font-mono text-slate-500">
                  {evidence.artifactStableId}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <details open className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer font-semibold">
          {isZh ? '销售事实明细' : 'Sale fact details'}
        </summary>
        <div className="mt-3 space-y-2 text-sm">
          {detail.lines.map((line) => (
            <div
              key={line.lineStableId}
              className="rounded-lg bg-slate-50 p-3"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{line.description}</span>
                <span className="font-semibold">
                  {money(line.lineAmountCents)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {line.quantity} {line.unit} × {money(line.unitPriceCents)} ·{' '}
                {line.revenueAccountStableId}
              </p>
            </div>
          ))}
          {detail.adjustments.map((adjustment) => (
            <div
              key={adjustment.adjustmentStableId}
              className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3"
            >
              <span>
                {adjustment.label} · {adjustment.revenueAccountStableId}
              </span>
              <span className="font-semibold">
                {money(adjustment.amountCents)}
              </span>
            </div>
          ))}
          {detail.taxes.map((tax) => (
            <div
              key={tax.taxStableId}
              className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3"
            >
              <span>
                {tax.label} · {tax.taxCode}
              </span>
              <span className="font-semibold">{money(tax.amountCents)}</span>
            </div>
          ))}
        </div>
      </details>

      <details open className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer font-semibold">
          {isZh
            ? `结算历史（${detail.settlements.length}）`
            : `Settlement history (${detail.settlements.length})`}
        </summary>
        <div className="mt-3 space-y-3">
          {detail.settlements.map((settlement) => (
            <ExternalSaleSettlementCard
              key={settlement.settlementStableId}
              settlement={settlement}
              reason={settlementReasons[settlement.settlementStableId] ?? ''}
              isZh={isZh}
              busy={busyKey === settlement.settlementStableId}
              onReason={(reason) =>
                setSettlementReasons((current) => ({
                  ...current,
                  [settlement.settlementStableId]: reason,
                }))
              }
              onReverse={() => reverseSettlement(settlement, false)}
              onCorrect={() =>
                settlement.reversedAt
                  ? onCorrectSettlement(settlement)
                  : reverseSettlement(settlement, true)
              }
            />
          ))}
          {detail.settlements.length === 0 ? (
            <p className="text-sm text-slate-500">
              {isZh ? '尚无结算记录。' : 'No settlements yet.'}
            </p>
          ) : null}
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
              <p className="mt-1 text-slate-500">
                {log.operatorActorRef}
              </p>
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
          {isZh ? '冲销 / 订正' : 'Reverse / correct'}
        </h3>
        <p className="mt-1 text-sm leading-6 text-red-800">
          {isZh
            ? '已入账事实不会原地编辑。冲销会追加 exact-inverse canonical Journal，历史永久保留；如果存在有效结算，必须先逐笔冲销结算。'
            : 'Posted facts are never edited in place. Reversal appends an exact-inverse canonical Journal and preserves history permanently. Live settlements must be reversed first.'}
        </p>
        {detail.reversedAt ? (
          !detail.replacedByExternalSaleStableId ? (
            <button
              type="button"
              onClick={() => onCorrectSale(detail)}
              className="mt-3 rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800"
            >
              {isZh
                ? '用原事实预填替代销售'
                : 'Prefill replacement from original'}
            </button>
          ) : null
        ) : (
          <div className="mt-3 space-y-3">
            {liveSettlements.length > 0 ? (
              <p className="text-sm font-medium text-red-800">
                {isZh
                  ? `当前有 ${liveSettlements.length} 条有效结算，Sale 冲销会被后端拒绝；请先冲销这些结算。`
                  : `${liveSettlements.length} live settlement(s) must be reversed before the Sale can be reversed.`}
              </p>
            ) : null}
            <textarea
              value={saleReason}
              onChange={(event) => setSaleReason(event.target.value)}
              placeholder={isZh ? '必填：冲销原因' : 'Required: reversal reason'}
              className="min-h-20 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyKey === 'sale' || liveSettlements.length > 0}
                onClick={() => reverseSale(false)}
                className="rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
              >
                {isZh ? '仅冲销' : 'Reverse only'}
              </button>
              <button
                type="button"
                disabled={busyKey === 'sale' || liveSettlements.length > 0}
                onClick={() => reverseSale(true)}
                className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isZh ? '冲销并开始订正' : 'Reverse & start correction'}
              </button>
            </div>
          </div>
        )}
      </div>

      {feedback ? (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {feedback}
        </p>
      ) : null}
    </section>
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
