import type { AccountingProviderFinancialReviewRevision } from './contracts/provider-financial';
import {
  formatCad,
  reviewStatusClass,
} from './provider-financial-review-model';

type Props = {
  revisions: AccountingProviderFinancialReviewRevision[];
  isZh: boolean;
};

export function ProviderFinancialReviewHistory({
  revisions,
  isZh,
}: Props) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {isZh
          ? '复核历史（' + revisions.length + '）'
          : 'Review history (' + revisions.length + ')'}
      </summary>
      <div className="mt-3 space-y-3">
        {revisions.length === 0 ? (
          <p className="text-xs text-slate-500">
            {isZh ? '还没有人工复核记录。' : 'No human review revisions yet.'}
          </p>
        ) : (
          revisions.map((revision) => (
            <div
              key={revision.reviewRevisionStableId}
              className="rounded border border-slate-200 p-3 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong>v{revision.revision}</strong>
                <span
                  className={
                    'rounded-full px-2 py-0.5 ' +
                    reviewStatusClass(revision.status)
                  }
                >
                  {revision.status}
                </span>
                <span className="text-slate-500">
                  {new Date(revision.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-slate-500">
                {isZh ? '创建' : 'Created'}: {revision.createdByUserStableId}
                {revision.confirmedAt
                  ? ` · ${isZh ? '确认' : 'Confirmed'}: ${revision.confirmedByUserStableId ?? '—'} · ${new Date(
                      revision.confirmedAt,
                    ).toLocaleString()}`
                  : ''}
              </p>
              {revision.note ? (
                <p className="mt-2 text-slate-700">{revision.note}</p>
              ) : null}
              <p className="mt-2 break-all font-mono text-[10px] text-slate-400">
                {revision.reviewRevisionStableId} · {revision.reviewHash}
              </p>
              {revision.effectiveSnapshotParserName ? (
                <div className="mt-2 rounded bg-violet-50 px-2 py-1.5 text-violet-800">
                  <p className="font-mono text-[10px]">
                    {revision.effectiveSnapshotParserName} v
                    {revision.effectiveSnapshotParserVersion ?? '—'} ·{' '}
                    {revision.effectiveLines.length} {isZh ? '行' : 'lines'}
                  </p>
                  <p className="mt-1 break-all text-[10px] text-violet-600">
                    {isZh ? '有效 ParseRun' : 'Effective ParseRun'}:{' '}
                    {revision.effectiveSnapshotParseRunStableId ?? '—'}
                  </p>
                  <p className="mt-1 break-all text-[10px] text-violet-600">
                    {isZh ? '源证据 ParseRun' : 'Source evidence ParseRun'}:{' '}
                    {revision.effectiveSnapshotSourceParseRunStableId ?? '—'}
                  </p>
                </div>
              ) : revision.corrections.length ? (
                <div className="mt-2 space-y-1">
                  {revision.corrections.map((correction) => (
                    <p
                      key={correction.correctionStableId}
                      className="text-slate-600"
                    >
                      {correction.reason} ·{' '}
                      {correction.effectiveRawName ??
                        correction.effectiveComponent}{' '}
                      · {formatCad(correction.effectiveAmountCents)}
                      {correction.note ? ' · ' + correction.note : ''}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-slate-500">
                  {isZh
                    ? '零修正：接受机器证据作为有效值。'
                    : 'Zero corrections: machine evidence accepted as effective.'}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </details>
  );
}
