import type { AccountingProviderFinancialDocument } from './contracts/provider-financial';
import type { AccountingProviderFinancialReviewRevision } from './contracts/provider-financial';
import type { ProviderSettlementDocumentPlan } from './contracts/settlements';
import {
  correctionForLine,
  formatCad,
  reviewStatusClass,
} from './provider-financial-review-model';

type Props = {
  document: AccountingProviderFinancialDocument;
  confirmedReview: AccountingProviderFinancialReviewRevision | null;
  effectiveLines: AccountingProviderFinancialDocument['lines'];
  isZh: boolean;
  controlTotalChecks: ProviderSettlementDocumentPlan['controlTotalChecks'];
  previewStatus: ProviderSettlementDocumentPlan['status'] | null;
};

export function ProviderFinancialReviewComparison({
  document,
  confirmedReview,
  effectiveLines,
  isZh,
  controlTotalChecks,
  previewStatus,
}: Props) {
  return (
    <>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-900">
          {isZh ? '机器值 vs 当前有效值' : 'Machine vs current effective values'}
        </h4>
        {confirmedReview?.effectiveSnapshotParserName ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {isZh ? '原机器结果' : 'Original machine result'}
              </p>
              <div className="mt-2 space-y-2">
                {document.lines.map((line) => (
                  <div
                    key={line.lineStableId}
                    className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      #{line.lineNo} · {line.rawName ?? line.component}
                    </p>
                    <p className="text-sm">{formatCad(line.amountCents)}</p>
                    <p className="break-all font-mono text-[11px] text-slate-500">
                      {line.component} · {line.postingTreatment} · {line.taxRole}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-violet-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                {isZh ? '已确认解析器快照' : 'Confirmed parser snapshot'}
              </p>
              <p className="mt-1 font-mono text-[11px] text-violet-700">
                {confirmedReview.effectiveSnapshotParserName} v
                {confirmedReview.effectiveSnapshotParserVersion ?? '—'}
              </p>
              <div className="mt-2 space-y-2">
                {effectiveLines.map((line) => (
                  <div
                    key={line.lineStableId}
                    className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      #{line.lineNo} · {line.rawName ?? line.component}
                    </p>
                    <p className="text-sm">{formatCad(line.amountCents)}</p>
                    <p className="break-all font-mono text-[11px] text-slate-500">
                      {line.component} · {line.postingTreatment} · {line.taxRole}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          document.lines.map((machineLine, index) => {
            const effectiveLine = effectiveLines[index] ?? machineLine;
            const correction = correctionForLine(
              confirmedReview,
              machineLine.lineStableId,
            );
            return (
              <div
                key={machineLine.lineStableId}
                className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2"
              >
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {isZh ? '机器' : 'Machine'}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    #{machineLine.lineNo} ·{' '}
                    {machineLine.rawName ?? machineLine.component}
                  </p>
                  <p className="mt-1 text-sm">
                    {formatCad(machineLine.amountCents)}
                  </p>
                  <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                    {machineLine.component} · {machineLine.postingTreatment} ·{' '}
                    {machineLine.taxRole}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {isZh ? '复核有效值' : 'Reviewed effective'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      {effectiveLine.rawName ?? effectiveLine.component}
                    </p>
                    {correction ? (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                        {correction.reason}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm">
                    {formatCad(effectiveLine.amountCents)}
                  </p>
                  <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                    {effectiveLine.component} · {effectiveLine.postingTreatment} ·{' '}
                    {effectiveLine.taxRole}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {controlTotalChecks.length > 0 || previewStatus ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              {isZh
                ? '当前 Shadow reconciliation'
                : 'Current Shadow reconciliation'}
            </h4>
            {previewStatus ? (
              <span
                className={
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                  reviewStatusClass(previewStatus)
                }
              >
                {previewStatus}
              </span>
            ) : null}
          </div>
          {controlTotalChecks.length ? (
            <div className="mt-2 space-y-1 text-xs">
              {controlTotalChecks.map((check) => (
                <div
                  key={check.key}
                  className="grid gap-1 border-t border-slate-100 py-2 first:border-t-0 sm:grid-cols-[1fr_auto_auto_auto]"
                >
                  <span>{check.controlRawName}</span>
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-center ' +
                      reviewStatusClass(check.status)
                    }
                  >
                    {check.status}
                  </span>
                  <span className="text-right">
                    {check.expectedCents === null
                      ? '—'
                      : formatCad(check.expectedCents)}
                  </span>
                  <span className="text-right text-slate-500">
                    Δ{' '}
                    {check.deltaCents === null
                      ? '—'
                      : formatCad(check.deltaCents)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              {isZh
                ? '确认人工复核后，需要重新运行 Shadow Preview 才能得到新的 reconciliation。'
                : 'After confirming a human review, rerun Shadow Preview to obtain fresh reconciliation.'}
            </p>
          )}
        </div>
      ) : null}
    </>
  );
}
