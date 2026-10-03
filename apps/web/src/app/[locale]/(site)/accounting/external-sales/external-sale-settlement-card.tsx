'use client';

import type { AccountingExternalSaleSettlement } from '../contracts/external-sales';
import { money } from './external-sales-utils';

export function ExternalSaleSettlementCard({
  settlement,
  reason,
  isZh,
  busy,
  onReason,
  onReverse,
  onCorrect,
}: {
  settlement: AccountingExternalSaleSettlement;
  reason: string;
  isZh: boolean;
  busy: boolean;
  onReason: (reason: string) => void;
  onReverse: () => void;
  onCorrect: () => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {settlement.settlementOn} · {money(settlement.appliedReceivableCents)}
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
            {settlement.settlementStableId}
          </p>
        </div>
        <span
          className={
            settlement.reversedAt
              ? 'rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-700'
              : 'rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800'
          }
        >
          {settlement.reversedAt ? 'REVERSED' : 'POSTED'}
        </span>
      </div>
      <p className="mt-2 break-all text-xs text-slate-500">
        Journal: {settlement.journalEntryStableId}
      </p>
      {settlement.note ? (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {settlement.note}
        </p>
      ) : null}
      <div className="mt-3 space-y-1.5 text-xs text-slate-600">
        {settlement.components.map((component, index) => (
          <div
            key={`${component.role}-${component.accountStableId}-${index}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
          >
            <span>
              {component.role} · {component.label} ·{' '}
              <span className="font-mono">{component.accountStableId}</span>
            </span>
            <span className="font-semibold text-slate-800">
              {money(component.amountCents)}
            </span>
          </div>
        ))}
      </div>
      {settlement.replacementForSettlementStableId ? (
        <p className="mt-1 break-all text-xs text-slate-500">
          {isZh ? '替代前序：' : 'Replaces: '}
          {settlement.replacementForSettlementStableId}
        </p>
      ) : null}
      {settlement.replacedBySettlementStableId ? (
        <p className="mt-1 break-all text-xs text-slate-500">
          {isZh ? '已被替代：' : 'Replaced by: '}
          {settlement.replacedBySettlementStableId}
        </p>
      ) : null}
      {!settlement.reversedAt ? (
        <div className="mt-3 space-y-2">
          <input
            value={reason}
            onChange={(event) => onReason(event.target.value)}
            placeholder={isZh ? '必填：结算冲销原因' : 'Required: reversal reason'}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onReverse}
              className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-800 disabled:opacity-50"
            >
              {isZh ? '冲销结算' : 'Reverse settlement'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCorrect}
              className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isZh ? '冲销并订正' : 'Reverse & correct'}
            </button>
          </div>
        </div>
      ) : !settlement.replacedBySettlementStableId ? (
        <button
          type="button"
          onClick={onCorrect}
          className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold"
        >
          {isZh ? '预填替代结算' : 'Prefill replacement settlement'}
        </button>
      ) : null}
    </article>
  );
}
