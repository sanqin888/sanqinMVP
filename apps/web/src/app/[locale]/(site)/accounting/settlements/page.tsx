'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { AccountingEvidenceViewer } from '../accounting-evidence-viewer';
import type { AccountingInboxItem } from '../contracts/inbox';
import type { AccountingProviderFinancialDocument } from '../contracts/provider-financial';
import type {
  ProviderSettlementPostingState,
  ProviderSettlementShadowPreview,
} from '../contracts/settlements';
import { ProviderFinancialReviewPanel } from '../provider-financial-review-panel';
import { CloverFeeReclassificationPanel } from './clover-fee-reclassification-panel';
import { CloverAuthorityReplacementPanel } from './clover-authority-replacement-panel';
import { ProviderPendingReconciliationPanel } from './provider-pending-reconciliation-panel';
import { ProviderPayoutPanel } from './provider-payout-panel';
import { SettlementReplayGate } from './settlement-replay-gate';
import {
  findSettlementNetLine,
  settlementDocumentBucket,
} from './settlement-summary';

const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

function nextIsoDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function linkedProviderDocumentStableIdFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const prefix = '#provider-';
  if (!window.location.hash.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(window.location.hash.slice(prefix.length));
  } catch {
    return null;
  }
}

function documentTitle(
  document: AccountingProviderFinancialDocument,
  isZh: boolean,
): string {
  const period =
    document.periodStart && document.periodEnd
      ? `${document.periodStart} → ${document.periodEnd}`
      : isZh
        ? '期间未提供'
        : 'Period unavailable';
  return `${document.provider} · ${period}`;
}

function statusClass(status: string): string {
  if (status === 'READY') return 'bg-emerald-100 text-emerald-800';
  if (status === 'BLOCKED') return 'bg-red-100 text-red-800';
  if (status === 'ALREADY_POSTED' || status === 'ALREADY_REVERSED') {
    return 'bg-blue-100 text-blue-800';
  }
  return 'bg-slate-100 text-slate-700';
}

function dispositionClass(disposition: string): string {
  if (disposition === 'BLOCKED') return 'bg-red-100 text-red-800';
  if (disposition === 'POSTABLE') return 'bg-emerald-100 text-emerald-800';
  return 'bg-slate-100 text-slate-700';
}

function controlTotalStatusClass(status: string): string {
  if (status === 'MATCHED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'MISMATCH') return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-800';
}

function formatDateTime(value: string | null, locale: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-CA');
}

function StatementLines({
  document,
  isZh,
}: {
  document: AccountingProviderFinancialDocument;
  isZh: boolean;
}) {
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        {isZh
          ? `机器 Canonical 明细（${document.lines.length} 条）`
          : `Machine canonical lines (${document.lines.length})`}
      </summary>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[780px] w-full text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">{isZh ? '原始项目' : 'Raw line'}</th>
              <th className="px-2 py-2">Component</th>
              <th className="px-2 py-2">Treatment</th>
              <th className="px-2 py-2">Tax role</th>
              <th className="px-2 py-2 text-right">{isZh ? '金额' : 'Amount'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {document.lines.map((line) => (
              <tr key={line.lineStableId}>
                <td className="px-2 py-2 text-slate-500">{line.lineNo}</td>
                <td className="px-2 py-2 font-medium text-slate-800">
                  {line.rawName ?? '—'}
                </td>
                <td className="px-2 py-2 font-mono text-[11px] text-slate-600">
                  {line.component}
                </td>
                <td className="px-2 py-2 text-slate-600">{line.postingTreatment}</td>
                <td className="px-2 py-2 text-slate-600">{line.taxRole}</td>
                <td className="px-2 py-2 text-right font-medium">
                  {money(line.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function evidenceFor(item: AccountingInboxItem) {
  return item.artifact.storedUrl
    ? {
        artifactStableId: item.artifact.artifactStableId,
        filename: item.artifact.originalFilename,
        kind: item.artifact.kind,
      }
    : null;
}


function ReadOnlyFinancialDocumentCard({
  item,
  document,
  isZh,
  postingState,
}: {
  item: AccountingInboxItem;
  document: AccountingProviderFinancialDocument;
  isZh: boolean;
  postingState?: ProviderSettlementPostingState;
}) {
  const evidence = evidenceFor(item);
  const netPayout = findSettlementNetLine(document.lines);

  return (
    <section
      id={'provider-' + document.documentStableId}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">
              {documentTitle(document, isZh)}
            </h3>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              CONFIRMED
            </span>
            {postingState ? (
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                {isZh ? '已入账' : 'POSTED'}
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                {document.documentType}
              </span>
            )}
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
              Revision {document.revision}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {item.artifact.originalFilename ??
              item.artifact.emailSubject ??
              document.documentStableId}
          </p>
        </div>
        {evidence ? (
          <AccountingEvidenceViewer
            evidence={evidence}
            isZh={isZh}
            label={isZh ? '查看证据' : 'Open evidence'}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-blue-700"
          />
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="text-xs text-slate-500">{isZh ? '门店' : 'Store'}</p>
          <p className="mt-1 break-all font-medium">
            {document.storeStableId ?? '—'}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="text-xs text-slate-500">Document type</p>
          <p className="mt-1 font-medium">{document.documentType}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="text-xs text-slate-500">
            {postingState
              ? 'Journal'
              : isZh
                ? '机器 Canonical 明细'
                : 'Machine canonical lines'}
          </p>
          <p className="mt-1 break-all font-mono text-xs">
            {postingState
              ? postingState.existingJournalEntryStableId ?? '—'
              : document.lines.length}
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3 text-sm">
          <p className="text-xs text-emerald-700">
            {isZh ? '机器净结算' : 'Machine net payout'}
          </p>
          <p className="mt-1 text-lg font-semibold text-emerald-900">
            {netPayout ? money(netPayout.amountCents) : '—'}
          </p>
        </div>
      </div>

      <StatementLines document={document} isZh={isZh} />

      {postingState &&
      document.provider === 'CLOVER' &&
      document.documentType === 'STATEMENT' ? (
        <CloverFeeReclassificationPanel
          documentStableId={document.documentStableId}
          isZh={isZh}
        />
      ) : null}

      <ProviderFinancialReviewPanel
        document={document}
        evidence={evidence}
        parseResult={item.artifact.parseRuns[0]?.resultJson ?? null}
        isZh={isZh}
        readOnly
      />
    </section>
  );
}

function ShadowPreviewPanel({
  preview,
  documentStableId,
  isZh,
  locale,
  onPreviewUpdated,
}: {
  preview: ProviderSettlementShadowPreview;
  documentStableId: string;
  isZh: boolean;
  locale: string;
  onPreviewUpdated: (preview: ProviderSettlementShadowPreview) => void;
}) {
  const documentPlan = preview.providerDocuments.find(
    (plan) => plan.documentStableId === documentStableId,
  );
  const coverage = documentPlan?.coverageEvidence ?? null;
  const controlTotalChecks = documentPlan?.controlTotalChecks ?? [];
  const reversalPlans = preview.uberPreCutoverOrderReversals;

  if (!documentPlan) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {isZh
          ? 'Shadow Preview 没有返回这份结算单的计划，请检查期间或最新 revision。'
          : 'The shadow preview did not return a plan for this statement. Check the range or latest revision.'}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-300 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">
              {isZh ? '只读 Shadow Preview' : 'Read-only shadow preview'}
            </h3>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(documentPlan.status)}`}
            >
              {documentPlan.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? 'Shadow Preview 本身只读；只有下方单独的强确认 Replay 闸门才允许调用真实 writer。'
              : 'Shadow Preview itself is read-only. Only the separate strongly confirmed replay gate below can call the real writer.'}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>
            {isZh ? '销售事实权威' : 'Sales authority'}:{' '}
            {documentPlan.salesAuthority}
          </p>
          <p>Revision: {documentPlan.revision}</p>
        </div>
      </div>

      {documentPlan.blockReasons.length ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-800">
            {isZh ? 'BLOCKED 原因' : 'Block reasons'}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-700">
            {documentPlan.blockReasons.map((reason) => (
              <li key={reason} className="break-all font-mono">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {controlTotalChecks.length ? (
        <div className="rounded-xl border border-slate-200 p-4">
          <h4 className="text-sm font-semibold">
            {isZh ? '原始控制总额校验' : 'Source control-total reconciliation'}
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? '源文件中的 section / Net Total 必须与识别后的 canonical 金额一致，否则结算保持 BLOCKED。'
              : 'Source section and Net Total controls must match the extracted canonical amounts or the settlement remains BLOCKED.'}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[680px] w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-2 py-2">{isZh ? '控制项' : 'Control'}</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">
                    {isZh ? '源文件总额' : 'Source total'}
                  </th>
                  <th className="px-2 py-2 text-right">
                    {isZh ? '识别计算值' : 'Calculated'}
                  </th>
                  <th className="px-2 py-2 text-right">
                    {isZh ? '差额' : 'Delta'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {controlTotalChecks.map((check) => (
                  <tr key={check.key}>
                    <td className="px-2 py-2 font-medium">
                      {check.controlRawName}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={
                          'rounded-full px-2 py-0.5 text-[11px] ' +
                          controlTotalStatusClass(check.status)
                        }
                      >
                        {check.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {check.expectedCents === null
                        ? '—'
                        : money(check.expectedCents)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {check.calculatedCents === null
                        ? '—'
                        : money(check.calculatedCents)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {check.deltaCents === null ? '—' : money(check.deltaCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <SettlementReplayGate
        preview={preview}
        documentStableId={documentStableId}
        isZh={isZh}
        onPreviewUpdated={onPreviewUpdated}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">
            {isZh ? 'Provider Journal' : 'Provider journal'}
          </p>
          <p className="mt-1 text-lg font-semibold">
            {money(documentPlan.debitCents)} / {money(documentPlan.creditCents)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Debit / Credit</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">
            {isZh ? '历史 Uber SALE' : 'Historical Uber SALEs'}
          </p>
          <p className="mt-1 text-lg font-semibold">
            {preview.counts.preCutoverUberSaleJournals}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isZh ? '候选原 Journal' : 'source journal candidates'}
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-xs text-emerald-700">
            {isZh ? '可逆转' : 'Ready reversals'}
          </p>
          <p className="mt-1 text-lg font-semibold text-emerald-800">
            {preview.counts.readyUberOrderReversals}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            {money(preview.amounts.readyUberReversalDebitCents)} /{' '}
            {money(preview.amounts.readyUberReversalCreditCents)}
          </p>
        </div>
        <div
          className={`rounded-xl p-3 ${
            preview.counts.blockedUberOrderReversals
              ? 'bg-red-50'
              : 'bg-slate-50'
          }`}
        >
          <p
            className={`text-xs ${
              preview.counts.blockedUberOrderReversals
                ? 'text-red-700'
                : 'text-slate-500'
            }`}
          >
            {isZh ? '阻塞 reversals' : 'Blocked reversals'}
          </p>
          <p
            className={`mt-1 text-lg font-semibold ${
              preview.counts.blockedUberOrderReversals ? 'text-red-800' : ''
            }`}
          >
            {preview.counts.blockedUberOrderReversals}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Provider documents: {preview.counts.readyProviderDocuments} READY /{' '}
            {preview.counts.blockedProviderDocuments} BLOCKED
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <h4 className="text-sm font-semibold">
            {isZh ? 'Review Authority' : 'Review authority'}
          </h4>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="text-slate-500">Status</dt>
            <dd>{documentPlan.reviewEvidence?.status ?? '—'}</dd>
            <dt className="text-slate-500">Reviewed</dt>
            <dd>{formatDateTime(documentPlan.reviewEvidence?.reviewedAt ?? null, locale)}</dd>
            <dt className="text-slate-500">Reviewer</dt>
            <dd className="break-all font-mono text-[11px]">
              {documentPlan.reviewEvidence?.reviewedByUserStableId ?? '—'}
            </dd>
            <dt className="text-slate-500">Latest revision</dt>
            <dd>{documentPlan.latestRevisionInRequestedRange ? 'YES' : 'NO'}</dd>
          </dl>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <h4 className="text-sm font-semibold">
            {isZh ? 'Provider Coverage' : 'Provider coverage'}
          </h4>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="text-slate-500">History from</dt>
            <dd>{coverage?.financialHistoryRequiredFrom ?? '—'}</dd>
            <dt className="text-slate-500">Complete through</dt>
            <dd>{coverage?.financialCompleteThrough ?? '—'}</dd>
            <dt className="text-slate-500">Live order cutover</dt>
            <dd>{formatDateTime(coverage?.liveOrderFactCutoverAt ?? null, locale)}</dd>
            <dt className="text-slate-500">Order detail from</dt>
            <dd>{coverage?.orderDetailCoverageFrom ?? '—'}</dd>
          </dl>
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 p-4" open>
        <summary className="cursor-pointer text-sm font-semibold">
          {isZh
            ? `Posting decisions（${documentPlan.decisions.length} 条）`
            : `Posting decisions (${documentPlan.decisions.length})`}
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">{isZh ? '项目' : 'Line'}</th>
                <th className="px-2 py-2">Component</th>
                <th className="px-2 py-2 text-right">{isZh ? '金额' : 'Amount'}</th>
                <th className="px-2 py-2">Disposition</th>
                <th className="px-2 py-2">{isZh ? '目标科目' : 'Target account'}</th>
                <th className="px-2 py-2">{isZh ? '原因' : 'Reason'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {documentPlan.decisions.map((decision) => (
                <tr key={decision.lineStableId}>
                  <td className="px-2 py-2 text-slate-500">{decision.lineNo}</td>
                  <td className="px-2 py-2 font-medium">{decision.rawName ?? '—'}</td>
                  <td className="px-2 py-2 font-mono text-[11px]">{decision.component}</td>
                  <td className="px-2 py-2 text-right">{money(decision.amountCents)}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${dispositionClass(decision.disposition)}`}
                    >
                      {decision.disposition}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px]">
                    <div>{decision.targetAccountStableId ?? '—'}</div>
                    {decision.targetCategoryStableId ? (
                      <div className="mt-1 text-slate-500">
                        {isZh ? '分类' : 'category'}:{' '}
                        {decision.targetCategoryStableId}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-slate-600">{decision.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {documentPlan.draftJournal ? (
        <details className="rounded-xl border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            {isZh
              ? `Provider Draft Journal（${documentPlan.draftJournal.lines.length} 行）`
              : `Provider draft journal (${documentPlan.draftJournal.lines.length} lines)`}
          </summary>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-2 py-2">Account</th>
                  <th className="px-2 py-2 text-right">Debit</th>
                  <th className="px-2 py-2 text-right">Credit</th>
                  <th className="px-2 py-2">Memo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {documentPlan.draftJournal.lines.map((line) => (
                  <tr
                    key={`${line.accountStableId}-${line.categoryStableId ?? ''}-${line.debitCents ?? 0}-${line.creditCents ?? 0}-${line.memo ?? ''}`}
                  >
                    <td className="px-2 py-2 font-mono text-[11px]">{line.accountStableId}</td>
                    <td className="px-2 py-2 text-right">{money(line.debitCents ?? 0)}</td>
                    <td className="px-2 py-2 text-right">{money(line.creditCents ?? 0)}</td>
                    <td className="px-2 py-2 text-slate-600">{line.memo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <details className="rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          {isZh
            ? `历史 Uber reversal candidates（${reversalPlans.length} 条）`
            : `Historical Uber reversal candidates (${reversalPlans.length})`}
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[820px] w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-2 py-2">{isZh ? '日期' : 'Date'}</th>
                <th className="px-2 py-2">Order / Fact</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2 text-right">Debit</th>
                <th className="px-2 py-2 text-right">Credit</th>
                <th className="px-2 py-2">{isZh ? '阻塞原因' : 'Block reasons'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reversalPlans.map((plan) => (
                <tr key={plan.originalJournalEntryStableId}>
                  <td className="px-2 py-2">{plan.occurredAt.slice(0, 10)}</td>
                  <td className="px-2 py-2 font-mono text-[11px]">{plan.orderStableId ?? '—'}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${statusClass(plan.status)}`}
                    >
                      {plan.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">{money(plan.debitCents)}</td>
                  <td className="px-2 py-2 text-right">{money(plan.creditCents)}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-slate-600">
                    {plan.blockReasons.join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

    </div>
  );
}

export default function AccountingSettlementsPage() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const isZh = locale === 'zh';
  const [items, setItems] = useState<AccountingInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    documentStableId: string;
    data: ProviderSettlementShadowPreview;
  } | null>(null);
  const [postingStates, setPostingStates] = useState<
    Record<string, ProviderSettlementPostingState>
  >({});
  const [postingNotice, setPostingNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPostingNotice(null);
    try {
      const inboxQuery = new URLSearchParams({
        status: 'CONFIRMED',
        classification: 'PROVIDER_FINANCIAL_DOCUMENT',
        limit: '200',
      });
      const linkedDocumentStableId = linkedProviderDocumentStableIdFromHash();
      if (linkedDocumentStableId) {
        inboxQuery.set('materializedEntityStableId', linkedDocumentStableId);
      }
      const confirmed = await apiFetch<AccountingInboxItem[]>(
        `/accounting/inbox?${inboxQuery.toString()}`,
      );
      const materialized = confirmed.filter(
        (item) =>
          item.materializedEntityType === 'PROVIDER_FINANCIAL_DOCUMENT' &&
          item.artifact.financialDocument !== null,
      );
      const statementIds = materialized.flatMap((item) => {
        const document = item.artifact.financialDocument;
        return document?.documentType === 'STATEMENT'
          ? [document.documentStableId]
          : [];
      });
      const postingStateRows =
        statementIds.length > 0
          ? await apiFetch<ProviderSettlementPostingState[]>(
              `/accounting/journal/provider-settlement/posting-states?${new URLSearchParams({
                documentStableIds: statementIds.join(','),
              }).toString()}`,
            )
          : [];

      setItems(materialized);
      setPostingStates(
        Object.fromEntries(
          postingStateRows.map((state) => [state.documentStableId, state]),
        ),
      );
      setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || typeof window === 'undefined') return;
    const linkedDocumentStableId = linkedProviderDocumentStableIdFromHash();
    if (!linkedDocumentStableId) return;
    window.document
      .getElementById(`provider-${linkedDocumentStableId}`)
      ?.scrollIntoView({ block: 'start' });
  }, [loading, items.length]);

  const providerDocuments = useMemo(
    () =>
      items
        .flatMap((item) =>
          item.artifact.financialDocument
            ? [{ item, document: item.artifact.financialDocument }]
            : [],
        )
        .sort((left, right) =>
          (right.document.periodEnd ?? right.item.createdAt).localeCompare(
            left.document.periodEnd ?? left.item.createdAt,
          ),
        ),
    [items],
  );
  const pendingStatements = useMemo(
    () =>
      providerDocuments.filter(
        ({ document }) =>
          settlementDocumentBucket(
            document,
            postingStates[document.documentStableId],
          ) === 'PENDING',
      ),
    [postingStates, providerDocuments],
  );
  const postedStatements = useMemo(
    () =>
      providerDocuments.filter(
        ({ document }) =>
          settlementDocumentBucket(
            document,
            postingStates[document.documentStableId],
          ) === 'POSTED',
      ),
    [postingStates, providerDocuments],
  );
  const supportingDocuments = useMemo(
    () =>
      providerDocuments.filter(
        ({ document }) =>
          settlementDocumentBucket(
            document,
            postingStates[document.documentStableId],
          ) === 'SUPPORTING',
      ),
    [postingStates, providerDocuments],
  );
  const knownStoreStableIds = useMemo(
    () =>
      [
        ...new Set(
          providerDocuments.flatMap(({ document }) =>
            document.storeStableId ? [document.storeStableId] : [],
          ),
        ),
      ].sort(),
    [providerDocuments],
  );

  function applyPreview(
    documentStableId: string,
    data: ProviderSettlementShadowPreview,
  ) {
    const documentPlan = data.providerDocuments.find(
      (plan) => plan.documentStableId === documentStableId,
    );
    if (documentPlan?.status === 'ALREADY_POSTED') {
      setPostingStates((current) => ({
        ...current,
        [documentStableId]: {
          documentStableId,
          postingState: 'POSTED',
          existingJournalEntryStableId:
            documentPlan.existingJournalEntryStableId,
        },
      }));
      setPreview(null);
      setPostingNotice(
        isZh
          ? '结算单已确认入账，并已移至“已入账结算”。'
          : 'The settlement is posted and has moved to Posted settlements.',
      );
      return;
    }
    setPreview({ documentStableId, data });
  }

  async function runShadowPreview(document: AccountingProviderFinancialDocument) {
    if (!document.storeStableId || !document.periodStart || !document.periodEnd) {
      setPreviewError(
        isZh
          ? '这份结算单缺少门店或完整期间，无法安全生成 shadow preview。'
          : 'This statement is missing its store or complete period, so a shadow preview cannot be generated safely.',
      );
      return;
    }
    setPreviewingId(document.documentStableId);
    setPreviewError(null);
    try {
      const query = new URLSearchParams({
        fromDate: document.periodStart,
        toDateExclusive: nextIsoDate(document.periodEnd),
        storeStableId: document.storeStableId,
        provider: document.provider,
      });
      const data = await apiFetch<ProviderSettlementShadowPreview>(
        `/accounting/journal/provider-settlement/shadow-preview?${query.toString()}`,
      );
      applyPreview(document.documentStableId, data);
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreviewingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isZh ? '平台结算' : 'Provider settlements'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {isZh
              ? '待处理区只保留尚未入账的月结单；已入账记录和补充证据分别归档。Shadow Preview 仍是只读，真实 replay 仅在严格 READY 且完成 planHash 强确认后开放。'
              : 'The work queue contains only unposted monthly statements; posted history and supporting evidence are archived separately. Shadow Preview remains read-only, and real replay is exposed only for a strictly READY plan after strong planHash confirmation.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
        >
          {loading
            ? isZh
              ? '刷新中…'
              : 'Refreshing…'
            : isZh
              ? '刷新'
              : 'Refresh'}
        </button>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        {isZh
          ? '安全边界：Shadow Preview 仍只读，READY 也不会自动写账。真实 replay 必须通过独立授权闸门，并在 POST 后立即用 fresh Preview reconciliation 核对结果。'
          : 'Safety boundary: Shadow Preview remains read-only and READY never writes automatically. Real replay requires the separate authorization gate and immediate fresh-Preview reconciliation after POST.'}
      </div>

      {knownStoreStableIds.map((storeStableId) => (
        <CloverAuthorityReplacementPanel
          key={`clover-authority-${storeStableId}`}
          storeStableId={storeStableId}
          isZh={isZh}
        />
      ))}

      <ProviderPendingReconciliationPanel
        isZh={isZh}
        knownStoreStableIds={knownStoreStableIds}
      />

      <ProviderPayoutPanel
        isZh={isZh}
        knownStoreStableIds={knownStoreStableIds}
      />

      {error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {previewError ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {previewError}
        </p>
      ) : null}

      {!loading && pendingStatements.length + postedStatements.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">
            {isZh ? '还没有已确认结算单' : 'No confirmed statements yet'}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {isZh
              ? '在“财务收件箱”确认平台结算单后，它会从待处理队列移到这里。'
              : 'After a provider statement is confirmed in Accounting Inbox, it moves out of the review queue and appears here.'}
          </p>
        </section>
      ) : null}

      {postingNotice ? (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {postingNotice}
        </p>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">
              {isZh ? '待处理结算' : 'Pending settlements'}
            </h2>
            <p className="text-xs text-slate-500">
              {isZh
                ? '仅显示尚未生成 settlement Journal 的已确认月结单。'
                : 'Confirmed monthly statements without a settlement Journal.'}
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
            {pendingStatements.length}
          </span>
        </div>

        {pendingStatements.length === 0 && !loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            {isZh ? '当前没有待处理结算单。' : 'There are no pending settlements.'}
          </div>
        ) : null}

        <div className="space-y-5">
          {pendingStatements.map(({ item, document }) => {
            const evidence = evidenceFor(item);
            const selectedPreview =
              preview?.documentStableId === document.documentStableId
                ? preview.data
                : null;
            const sales = document.lines.find(
              (line) => line.component === 'SALES',
            );
            const salesTax =
              document.lines.find(
                (line) => line.rawName?.toLowerCase() === 'tax on sales',
              ) ??
              document.lines.find((line) => line.component === 'SALES_TAX');
            const commission = document.lines.find(
              (line) => line.component === 'COMMISSION',
            );
            const netPayout = findSettlementNetLine(document.lines);
            const postingState = postingStates[document.documentStableId];
            const selectedPlan =
              selectedPreview?.providerDocuments.find(
                (plan) => plan.documentStableId === document.documentStableId,
              ) ?? null;

            return (
              <section
                key={document.documentStableId}
                id={'provider-' + document.documentStableId}
                className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">
                        {documentTitle(document, isZh)}
                      </h2>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        CONFIRMED
                      </span>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                        {postingState?.postingState === 'NOT_POSTED'
                          ? isZh
                            ? '未入账'
                            : 'NOT POSTED'
                          : isZh
                            ? '状态未知'
                            : 'STATE UNKNOWN'}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                        Revision {document.revision}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.artifact.originalFilename ??
                        item.artifact.emailSubject ??
                        document.documentStableId}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {evidence ? (
                      <AccountingEvidenceViewer
                        evidence={evidence}
                        isZh={isZh}
                        label={isZh ? '查看证据' : 'Open evidence'}
                        className="rounded border border-slate-300 px-3 py-2 text-sm text-blue-700"
                      />
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        previewingId === document.documentStableId ||
                        !document.storeStableId ||
                        !document.periodStart ||
                        !document.periodEnd
                      }
                      onClick={() => void runShadowPreview(document)}
                      className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {previewingId === document.documentStableId
                        ? isZh
                          ? '生成中…'
                          : 'Building…'
                        : selectedPreview
                          ? isZh
                            ? '重新运行 Shadow Preview'
                            : 'Refresh shadow preview'
                          : isZh
                            ? '运行 Shadow Preview'
                            : 'Run shadow preview'}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="text-xs text-slate-500">
                      {isZh ? '门店' : 'Store'}
                    </p>
                    <p className="mt-1 break-all font-medium">
                      {document.storeStableId ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="text-xs text-slate-500">Parser</p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {document.parserName}:v{document.parserVersion}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="text-xs text-slate-500">Provider ref</p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {document.providerDocumentRef ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="text-xs text-slate-500">
                      {isZh ? '机器 Canonical 行' : 'Machine canonical lines'}
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {document.lines.length}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">
                      {isZh ? '机器 Sales' : 'Machine Sales'}
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {sales ? money(sales.amountCents) : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">
                      {isZh ? '机器 Tax on Sales' : 'Machine Tax on Sales'}
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {salesTax ? money(salesTax.amountCents) : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">
                      {isZh
                        ? '机器平台佣金 / 费用'
                        : 'Machine commission / fees'}
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {commission ? money(commission.amountCents) : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-700">
                      {isZh ? '机器净结算' : 'Machine net payout'}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-900">
                      {netPayout ? money(netPayout.amountCents) : '—'}
                    </p>
                  </div>
                </div>

                <StatementLines document={document} isZh={isZh} />

                <ProviderFinancialReviewPanel
                  document={document}
                  evidence={evidence}
                  parseResult={item.artifact.parseRuns[0]?.resultJson ?? null}
                  isZh={isZh}
                  controlTotalChecks={selectedPlan?.controlTotalChecks ?? []}
                  previewStatus={selectedPlan?.status ?? null}
                  onConfirmed={() => {
                    if (
                      preview?.documentStableId === document.documentStableId
                    ) {
                      setPreview(null);
                    }
                    setPostingNotice(
                      isZh
                        ? '人工复核已确认；旧 Shadow Preview 已作废。请重新运行 Shadow Preview 后再入账。'
                        : 'Human review confirmed; the previous Shadow Preview is stale. Rerun Shadow Preview before posting.',
                    );
                  }}
                />

                {selectedPreview ? (
                  <ShadowPreviewPanel
                    preview={selectedPreview}
                    documentStableId={document.documentStableId}
                    isZh={isZh}
                    locale={locale}
                    onPreviewUpdated={(data) =>
                      applyPreview(document.documentStableId, data)
                    }
                  />
                ) : null}
              </section>
            );
          })}
        </div>
      </section>

      <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <summary className="cursor-pointer text-base font-semibold text-slate-800">
          {isZh
            ? `已入账结算（${postedStatements.length}）`
            : `Posted settlements (${postedStatements.length})`}
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          {isZh
            ? '这些月结单已经生成 settlement Journal，不再提供 Replay 操作；这里保留原始凭证、Journal 标识和 canonical 明细用于审计。'
            : 'These monthly statements already have settlement Journals. Replay is no longer offered; evidence, Journal identity, and canonical lines remain available for audit.'}
        </p>
        <div className="mt-4 space-y-4">
          {postedStatements.length === 0 ? (
            <p className="text-sm text-slate-500">
              {isZh ? '还没有已入账结算单。' : 'No posted settlements yet.'}
            </p>
          ) : (
            postedStatements.map(({ item, document }) => (
              <ReadOnlyFinancialDocumentCard
                key={document.documentStableId}
                item={item}
                document={document}
                isZh={isZh}
                postingState={postingStates[document.documentStableId]}
              />
            ))
          )}
        </div>
      </details>

      {supportingDocuments.length > 0 ? (
        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <summary className="cursor-pointer text-base font-semibold text-slate-800">
            {isZh
              ? `补充 / 控制证据（${supportingDocuments.length}）`
              : `Supporting / control evidence (${supportingDocuments.length})`}
          </summary>
          <p className="mt-2 text-xs text-slate-500">
            {isZh
              ? '这些已确认文件用于补充或控制核对，不作为独立的月结 Replay 工作项。'
              : 'These confirmed documents support or control reconciliation and are not independent monthly replay work items.'}
          </p>
          <div className="mt-4 space-y-4">
            {supportingDocuments.map(({ item, document }) => (
              <ReadOnlyFinancialDocumentCard
                key={document.documentStableId}
                item={item}
                document={document}
                isZh={isZh}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
