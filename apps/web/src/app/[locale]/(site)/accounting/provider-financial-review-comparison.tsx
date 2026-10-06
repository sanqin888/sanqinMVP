import type { AccountingProviderFinancialDocument } from './contracts/provider-financial';
import type { AccountingProviderFinancialReviewRevision } from './contracts/provider-financial';
import type { ProviderSettlementDocumentPlan } from './contracts/settlements';
import {
  formatCad,
  reviewStatusClass,
} from './provider-financial-review-model';

type Props = {
  confirmedReview: AccountingProviderFinancialReviewRevision | null;
  effectiveLines: AccountingProviderFinancialDocument['lines'];
  isZh: boolean;
  controlTotalChecks: ProviderSettlementDocumentPlan['controlTotalChecks'];
  previewStatus: ProviderSettlementDocumentPlan['status'] | null;
};

export function ProviderFinancialReviewComparison({
  confirmedReview,
  effectiveLines,
  isZh,
  controlTotalChecks,
  previewStatus,
}: Props) {
  const verticalPassed =
    controlTotalChecks.length > 0 &&
    controlTotalChecks.every((check) => check.status === 'MATCHED');

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              {isZh ? '当前待入账有效值' : 'Current values to be posted'}
            </h4>
            <p className="mt-0.5 text-xs text-slate-500">
              {isZh
                ? '这些值在进入审核时由收件箱结果预填；如需修正，请在下方编辑并确认新的复核版本。CONTROL_TOTAL / RECONCILIATION_ONLY 只参与核算，不写入 Journal。'
                : 'These values are prefilled when the item enters review. Edit and confirm a new review revision when changes are needed. CONTROL_TOTAL / RECONCILIATION_ONLY rows participate in reconciliation but are not posted to the Journal.'}
            </p>
          </div>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
            {confirmedReview
              ? isZh
                ? `有效版本 v${confirmedReview.revision}`
                : `Effective v${confirmedReview.revision}`
              : isZh
                ? '收件箱预填版本'
                : 'Inbox-prefilled version'}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-[760px] w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">{isZh ? '待入账项目' : 'Review item'}</th>
                <th className="px-3 py-2">Component</th>
                <th className="px-3 py-2">Treatment</th>
                <th className="px-3 py-2">Tax role</th>
                <th className="px-3 py-2 text-right">{isZh ? '有效金额' : 'Effective amount'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {effectiveLines.map((line) => (
                <tr key={line.lineStableId}>
                  <td className="px-3 py-2 text-slate-500">{line.lineNo}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {line.rawName ?? line.component}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                    {line.component}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {line.postingTreatment}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{line.taxRole}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCad(line.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div
        className={`rounded-lg border p-3 ${
          verticalPassed
            ? 'border-emerald-200 bg-emerald-50/60'
            : 'border-red-300 bg-red-50'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4
              className={`text-sm font-semibold ${
                verticalPassed ? 'text-emerald-900' : 'text-red-900'
              }`}
            >
              {isZh ? '纵向业务核算' : 'Vertical business reconciliation'}
            </h4>
            <p className="mt-0.5 text-xs text-slate-600">
              {isZh
                ? '平台账单的 section / subtotal / tax / transfer 控制总额必须与当前待入账有效明细逐层对平。'
                : 'Statement section, subtotal, tax, and transfer controls must reconcile to the current effective review values.'}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              verticalPassed
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {verticalPassed
              ? isZh
                ? '通过'
                : 'PASSED'
              : previewStatus
                ? isZh
                  ? '未通过'
                  : 'FAILED'
                : isZh
                  ? '待核算'
                  : 'PENDING'}
          </span>
        </div>

        {controlTotalChecks.length ? (
          <div className="mt-3 overflow-x-auto rounded border border-white/80 bg-white">
            <table className="min-w-[680px] w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-3 py-2">{isZh ? '核算项' : 'Control'}</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">
                    {isZh ? '控制总额' : 'Control total'}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {isZh ? '明细计算' : 'Detail calculation'}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {isZh ? '差额' : 'Delta'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {controlTotalChecks.map((check) => (
                  <tr key={check.key}>
                    <td className="px-3 py-2 font-medium">
                      {check.controlRawName}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                          reviewStatusClass(check.status)
                        }
                      >
                        {check.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {check.expectedCents === null
                        ? '—'
                        : formatCad(check.expectedCents)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {check.calculatedCents === null
                        ? '—'
                        : formatCad(check.calculatedCents)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        check.deltaCents === 0
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }`}
                    >
                      {check.deltaCents === null
                        ? '—'
                        : formatCad(check.deltaCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 rounded bg-red-100 px-3 py-2 text-xs font-medium text-red-800">
            {isZh
              ? previewStatus
                ? '没有足够的控制总额完成纵向核算；该结算不能入账。'
                : '尚未运行核算。系统核算后才会开放入账。'
              : previewStatus
                ? 'There are not enough control totals to complete vertical reconciliation; posting is blocked.'
                : 'Reconciliation has not run yet. Posting opens only after validation passes.'}
          </p>
        )}
      </div>
    </>
  );
}
