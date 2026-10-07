'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { AccountingEvidenceViewer } from '../accounting-evidence-viewer';
import { ProviderFinancialReviewPanel } from '../provider-financial-review-panel';
import type { AccountingInboxItem } from '../contracts/inbox';
import type { AccountingProviderFinancialDocument } from '../contracts/provider-financial';
import type {
  ProviderSettlementPostingState,
  ProviderSettlementShadowPreview,
} from '../contracts/settlements';
import { CloverFeeReclassificationPanel } from './clover-fee-reclassification-panel';
import { CloverAuthorityReplacementPanel } from './clover-authority-replacement-panel';
import { ProviderPendingReconciliationPanel } from './provider-pending-reconciliation-panel';
import { ProviderPayoutPanel } from './provider-payout-panel';
import { ProviderPostedCorrectionPanel } from './provider-posted-correction-panel';
import { SettlementReplayGate } from './settlement-replay-gate';
import {
  settlementBlockReasonGuidance,
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

function reconciliationStatusClass(status: string): string {
  if (status === 'MATCHED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'MISMATCH') return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-800';
}

function formatDateTime(value: string | null, locale: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-CA');
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
  const journal = postingState?.journal ?? null;
  const supportingEvidence = document.documentType !== 'STATEMENT';

  if (journal) {
    const debitCents = journal.lines.reduce(
      (sum, line) => sum + line.debitCents,
      0,
    );
    const creditCents = journal.lines.reduce(
      (sum, line) => sum + line.creditCents,
      0,
    );

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
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                {isZh ? '已入账' : 'POSTED'}
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
          {evidence ? (
            <AccountingEvidenceViewer
              evidence={evidence}
              isZh={isZh}
              label={isZh ? '查看原始凭证' : 'Open source evidence'}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-blue-700"
            />
          ) : null}
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <h4 className="text-sm font-semibold text-blue-950">
            {isZh ? '数据库已入账 Journal' : 'Persisted posted journal'}
          </h4>
          <p className="mt-1 text-xs text-blue-800">
            {isZh
              ? '这里显示的是已经写入数据库的最终会计事实，不读取或重算原始识别数字。'
              : 'This view shows the final accounting facts persisted in the database. It does not display or recalculate recognition output.'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-xs text-slate-500">{isZh ? '门店' : 'Store'}</p>
            <p className="mt-1 break-all font-medium">
              {document.storeStableId ?? '—'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-xs text-slate-500">
              {isZh ? 'Journal 日期' : 'Journal date'}
            </p>
            <p className="mt-1 font-medium">
              {formatDateTime(journal.occurredAt, isZh ? 'zh' : 'en')}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-xs text-slate-500">Journal</p>
            <p className="mt-1 break-all font-mono text-xs">
              {journal.entryStableId}
            </p>
            <p className="mt-1 text-xs text-slate-500">{journal.currency}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3 text-sm">
            <p className="text-xs text-emerald-700">
              {isZh ? '已入账借 / 贷' : 'Posted debit / credit'}
            </p>
            <p className="mt-1 text-lg font-semibold text-emerald-900">
              {money(debitCents)} / {money(creditCents)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[760px] w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">{isZh ? '科目' : 'Account'}</th>
                <th className="px-3 py-2">{isZh ? '分类' : 'Category'}</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2">{isZh ? '备注' : 'Memo'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {journal.lines.map((line) => (
                <tr key={line.lineNo}>
                  <td className="px-3 py-2 text-slate-500">{line.lineNo}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-900">
                      {line.accountName}
                    </p>
                    <p className="font-mono text-[10px] text-slate-500">
                      {line.accountStableId}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    {line.categoryName ?? line.categoryStableId ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {line.debitCents ? money(line.debitCents) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {line.creditCents ? money(line.creditCents) : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {line.memo ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {journal.memo ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {journal.memo}
          </p>
        ) : null}

        {document.documentType === 'STATEMENT' ? (
          <ProviderPostedCorrectionPanel document={document} isZh={isZh} />
        ) : null}

        {document.provider === 'CLOVER' &&
        document.documentType === 'STATEMENT' ? (
          <CloverFeeReclassificationPanel
            documentStableId={document.documentStableId}
            isZh={isZh}
          />
        ) : null}
      </section>
    );
  }

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
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
              {document.documentType}
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
            label={isZh ? '查看原始凭证' : 'Open source evidence'}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-blue-700"
          />
        ) : null}
      </div>

      <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4">
        <p className="font-semibold text-cyan-950">
          {supportingEvidence
            ? isZh
              ? '辅助 / 控制证据'
              : 'Supporting / control evidence'
            : isZh
              ? '尚未读取到已入账 Journal'
              : 'Posted journal not loaded'}
        </p>
        <p className="mt-1 text-xs leading-5 text-cyan-900">
          {supportingEvidence
            ? isZh
              ? '该文件只作为已确认证据保存，不是独立入账记录。识别明细只在收件箱阶段展示。'
              : 'This file is retained as confirmed evidence and is not an independent posting record. Recognition detail is shown only in Inbox.'
            : isZh
              ? '状态显示已入账但数据库 Journal 明细尚未加载，请刷新页面；这里不会回退显示识别数字。'
              : 'The statement is marked posted but its persisted Journal detail is not loaded yet. Refresh the page; this view will not fall back to recognition output.'}
        </p>
      </div>
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
  const verticalPassed =
    controlTotalChecks.length > 0 &&
    controlTotalChecks.every((check) => check.status === 'MATCHED');
  const horizontalPassed =
    documentPlan?.draftJournal != null &&
    documentPlan.debitCents === documentPlan.creditCents;
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
              {isZh
                ? '将要入账的结算预览（只读）'
                : 'Values to be posted (read-only)'}
            </h3>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(documentPlan.status)}`}
            >
              {documentPlan.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? '这里显示本次 Replay 将写入的处理决定和 Journal 金额，供人工复核；只有下方单独的强确认闸门才会真正写库。'
              : 'This view shows the decisions and Journal amounts that Replay would write for human review. Only the separate strong-confirmation gate writes to the database.'}
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
            {isZh ? '核算未通过' : 'Reconciliation failed'}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-700">
            {documentPlan.blockReasons.map((reason) => {
              const guidance = settlementBlockReasonGuidance(reason, isZh);
              return (
                <li key={reason} className="break-all">
                  <span className="font-mono">{reason}</span>
                  {guidance ? (
                    <p className="mt-1 font-sans leading-5 text-red-800">
                      {guidance}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div
          className={`rounded-xl border p-4 ${
            verticalPassed
              ? 'border-emerald-200 bg-emerald-50/60'
              : 'border-red-300 bg-red-50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <h4
              className={`text-sm font-semibold ${
                verticalPassed ? 'text-emerald-900' : 'text-red-900'
              }`}
            >
              {isZh ? '纵向业务核算' : 'Vertical business reconciliation'}
            </h4>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                verticalPassed
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {verticalPassed ? 'PASSED' : 'FAILED'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {isZh
              ? '各 section / subtotal / tax / transfer 控制总额必须与当前待入账明细逐层一致。'
              : 'Section, subtotal, tax, and transfer controls must reconcile to the current values to be posted.'}
          </p>
          {controlTotalChecks.length ? (
            <div className="mt-3 space-y-2">
              {controlTotalChecks.map((check) => (
                <div
                  key={check.key}
                  className="grid gap-1 rounded border border-white/80 bg-white px-3 py-2 text-xs sm:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]"
                >
                  <span className="font-medium">{check.controlRawName}</span>
                  <span>
                    {isZh ? '控制' : 'Control'}:{' '}
                    {check.expectedCents === null
                      ? '—'
                      : money(check.expectedCents)}
                  </span>
                  <span>
                    {isZh ? '明细' : 'Detail'}:{' '}
                    {check.calculatedCents === null
                      ? '—'
                      : money(check.calculatedCents)}
                  </span>
                  <span
                    className={
                      check.status === 'MATCHED'
                        ? 'font-medium text-emerald-700'
                        : 'font-medium text-red-700'
                    }
                  >
                    <span
                      className={
                        'mr-1 rounded-full px-1.5 py-0.5 text-[10px] ' +
                        reconciliationStatusClass(check.status)
                      }
                    >
                      {check.status}
                    </span>
                    {check.deltaCents === null
                      ? ''
                      : `${isZh ? '差额 ' : 'Δ '}${money(check.deltaCents)}`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded bg-red-100 px-3 py-2 text-xs font-medium text-red-800">
              {isZh
                ? '没有足够的控制总额完成纵向核算，当前禁止入账。'
                : 'There are not enough control totals to complete vertical reconciliation; posting is blocked.'}
            </p>
          )}
        </div>

        <div
          className={`rounded-xl border p-4 ${
            horizontalPassed
              ? 'border-emerald-200 bg-emerald-50/60'
              : 'border-amber-300 bg-amber-50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <h4
              className={`text-sm font-semibold ${
                horizontalPassed ? 'text-emerald-900' : 'text-amber-900'
              }`}
            >
              {isZh ? '横向借贷平衡' : 'Horizontal debit/credit balance'}
            </h4>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                horizontalPassed
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {horizontalPassed
                ? 'PASSED'
                : verticalPassed
                  ? 'FAILED'
                  : 'PENDING'}
            </span>
          </div>
          <p className="mt-3 text-sm">
            Debit <strong>{money(documentPlan.debitCents)}</strong> / Credit{' '}
            <strong>{money(documentPlan.creditCents)}</strong>
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {horizontalPassed
              ? isZh
                ? 'Draft Journal 借贷一致。'
                : 'The draft Journal is balanced.'
              : verticalPassed
                ? isZh
                  ? 'Draft Journal 未能形成借贷平衡，当前禁止入账。'
                  : 'The draft Journal is not balanced; posting is blocked.'
                : isZh
                  ? '纵向核算通过后才会生成可验证的 Draft Journal。'
                  : 'A verifiable draft Journal is generated only after vertical reconciliation passes.'}
          </p>
        </div>
      </div>

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
            ? `将要入账的处理决定（${documentPlan.decisions.length} 条）`
            : `Posting decisions to write (${documentPlan.decisions.length})`}
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
              ? `将要写入的 Journal（${documentPlan.draftJournal.lines.length} 行）`
              : `Journal to be written (${documentPlan.draftJournal.lines.length} lines)`}
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
  const [reviewPendingByDocumentStableId, setReviewPendingByDocumentStableId] =
    useState<Record<string, boolean>>({});
  const [
    autoReconciledDocumentStableId,
    setAutoReconciledDocumentStableId,
  ] = useState<string | null>(null);

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

  const applyPreview = useCallback(
    (
      documentStableId: string,
      data: ProviderSettlementShadowPreview,
    ) => {
      const documentPlan = data.providerDocuments.find(
        (plan) => plan.documentStableId === documentStableId,
      );
      if (documentPlan?.status === 'ALREADY_POSTED') {
        setPreview(null);
        void load().then(() => {
          setPostingNotice(
            isZh
              ? '结算单已确认入账；页面已重新读取数据库 Journal。'
              : 'The settlement is posted; the page reloaded the persisted Journal from the database.',
          );
        });
        return;
      }
      setPreview({ documentStableId, data });
    },
    [isZh, load],
  );

  const runShadowPreview = useCallback(async (
    document: AccountingProviderFinancialDocument,
  ) => {
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
  }, [applyPreview, isZh]);

  useEffect(() => {
    if (loading || preview || previewingId) return;
    const linkedDocumentStableId = linkedProviderDocumentStableIdFromHash();
    if (
      !linkedDocumentStableId ||
      autoReconciledDocumentStableId === linkedDocumentStableId
    ) {
      return;
    }
    const target = pendingStatements.find(
      ({ document }) =>
        document.documentStableId === linkedDocumentStableId,
    );
    if (
      !target ||
      reviewPendingByDocumentStableId[linkedDocumentStableId] !== false
    ) {
      return;
    }
    setAutoReconciledDocumentStableId(linkedDocumentStableId);
    void runShadowPreview(target.document);
  }, [
    autoReconciledDocumentStableId,
    loading,
    pendingStatements,
    preview,
    previewingId,
    reviewPendingByDocumentStableId,
    runShadowPreview,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isZh ? '平台结算' : 'Provider settlements'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {isZh
              ? '待处理区只审核“将要入账”的结算计划，不重复展示收件箱识别值；已入账区只展示数据库实际 Journal。Shadow Preview 只读，真实 replay 仅在严格 READY 且完成 planHash 强确认后开放。'
              : 'The work queue reviews only the settlement plan to be posted and does not repeat Inbox recognition values; posted history shows only persisted Journals. Shadow Preview remains read-only, and real replay is exposed only for a strictly READY plan after strong planHash confirmation.'}
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
            const selectedPlan =
              selectedPreview?.providerDocuments.find(
                (plan) => plan.documentStableId === document.documentStableId,
              ) ?? null;
            const postingState = postingStates[document.documentStableId];

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
                        reviewPendingByDocumentStableId[
                          document.documentStableId
                        ] !== false ||
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
                            ? '重新核算待入账值'
                            : 'Recalculate posting values'
                          : isZh
                            ? '核算待入账值'
                            : 'Reconcile posting values'}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="text-xs text-slate-500">
                      {isZh ? '门店' : 'Store'}
                    </p>
                    <p className="mt-1 break-all font-medium">
                      {document.storeStableId ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="text-xs text-slate-500">Provider ref</p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {document.providerDocumentRef ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="text-xs text-slate-500">Revision</p>
                    <p className="mt-1 font-medium">{document.revision}</p>
                  </div>
                </div>

                <ProviderFinancialReviewPanel
                  document={document}
                  evidence={evidence}
                  isZh={isZh}
                  controlTotalChecks={selectedPlan?.controlTotalChecks ?? []}
                  previewStatus={selectedPlan?.status ?? null}
                  onPendingChange={(pending) => {
                    setReviewPendingByDocumentStableId((current) => {
                      if (current[document.documentStableId] === pending) {
                        return current;
                      }
                      return {
                        ...current,
                        [document.documentStableId]: pending,
                      };
                    });
                    if (
                      pending &&
                      preview?.documentStableId === document.documentStableId
                    ) {
                      setPreview(null);
                      setPostingNotice(
                        isZh
                          ? '待入账值存在未确认修改；旧核算结果已失效。请先保存并确认修正。'
                          : 'Posting-review values have unconfirmed changes; the previous reconciliation is stale. Save and confirm the correction first.',
                      );
                    }
                  }}
                  onConfirmed={() => {
                    setPreview(null);
                    setPostingNotice(
                      isZh
                        ? '待入账值已更新；正在重新核算最新版本。'
                        : 'Posting-review values were updated; recalculating the latest version.',
                    );
                    void runShadowPreview(document);
                  }}
                />

                {!selectedPreview ? (
                  <div
                    className={`rounded-xl border p-4 ${
                      reviewPendingByDocumentStableId[document.documentStableId]
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-blue-200 bg-blue-50/60'
                    }`}
                  >
                    <h3
                      className={`text-sm font-semibold ${
                        reviewPendingByDocumentStableId[document.documentStableId]
                          ? 'text-amber-950'
                          : 'text-blue-950'
                      }`}
                    >
                      {reviewPendingByDocumentStableId[document.documentStableId]
                        ? isZh
                          ? '有未确认的待入账修改'
                          : 'Unconfirmed posting-review changes'
                        : isZh
                          ? '待入账值尚未核算'
                          : 'Posting values have not been reconciled yet'}
                    </h3>
                    <p
                      className={`mt-1 text-xs leading-5 ${
                        reviewPendingByDocumentStableId[document.documentStableId]
                          ? 'text-amber-800'
                          : 'text-blue-800'
                      }`}
                    >
                      {reviewPendingByDocumentStableId[document.documentStableId]
                        ? isZh
                          ? '请先保存草稿并确认新的复核 revision。未确认修改不会参与核算，也不会开放入账。'
                          : 'Save the draft and confirm the new review revision first. Unconfirmed edits are excluded from reconciliation and posting remains locked.'
                        : isZh
                          ? '当前待入账值由收件箱确认结果预填。点击“核算待入账值”后，系统会执行纵向业务平账并生成 Draft Journal 检查借贷平衡；两者都通过才允许入账。'
                          : 'Current posting-review values are prefilled from the confirmed Inbox result. Reconcile them to run vertical business checks and build a draft Journal; posting opens only when both vertical and debit/credit checks pass.'}
                    </p>
                  </div>
                ) : null}

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
            ? '这些月结单已经生成 settlement Journal，不再提供 Replay；卡片直接读取数据库中实际保存的 Journal 和明细，原始凭证仅作为审计证据。'
            : 'These monthly statements already have settlement Journals and no longer offer Replay. Cards read the persisted Journal and lines directly from the database; source documents remain audit evidence only.'}
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
