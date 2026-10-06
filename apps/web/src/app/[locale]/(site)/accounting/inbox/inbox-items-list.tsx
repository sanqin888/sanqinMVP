'use client';

import { AccountingEvidenceViewer } from '../accounting-evidence-viewer';
import type { AccountingFinancialProvider } from '../contracts/core';
import type {
  AccountingInboxClassification,
  AccountingInboxItem,
  AccountingManualUploadPermanentDeleteResult,
} from '../contracts/inbox';
import {
  isProviderSupportingEvidence,
  latestParse,
  money,
  providerEvidenceSummaryLines,
  validatedProviderFinancialDocumentType,
} from './inbox-model';

type Props = {
  items: AccountingInboxItem[];
  loading: boolean;
  isZh: boolean;
  busySender: boolean;
  classifyingId: string | null;
  discardingId: string | null;
  confirmingProviderId: string | null;
  confirmingOtherId: string | null;
  uploadingExpenseEvidenceId: string | null;
  removingExpenseEvidenceId: string | null;
  beginningExpenseReviewId: string | null;
  onTrustSender: (email: string) => Promise<void>;
  onIgnoreSender: (email: string) => Promise<void>;
  onClassificationChange: (
    item: AccountingInboxItem,
    classification: AccountingInboxClassification,
    selectedProvider: AccountingFinancialProvider | null,
  ) => Promise<void>;
  onUploadExpenseEvidence: (
    item: AccountingInboxItem,
    file: File,
  ) => Promise<void>;
  onRemoveExpenseEvidence: (item: AccountingInboxItem) => Promise<void>;
  onReviewExpense: (item: AccountingInboxItem) => Promise<void>;
  onReviewBankCsv: (item: AccountingInboxItem) => void;
  onConfirmProviderFinancial: (item: AccountingInboxItem) => Promise<void>;
  onConfirmOther: (item: AccountingInboxItem) => Promise<void>;
  onDiscard: (item: AccountingInboxItem) => Promise<void>;
  permanentDeleteCapabilities: ReadonlyMap<string, boolean>;
  onEvidenceDeleted: (
    result: AccountingManualUploadPermanentDeleteResult,
  ) => Promise<void>;
};

const providerOptions: Array<{
  value: AccountingFinancialProvider;
  label: string;
}> = [
  { value: 'CLOVER', label: 'Clover' },
  { value: 'UBER_EATS', label: 'Uber Eats' },
  { value: 'FANTUAN', label: 'Fantuan' },
];

export function AccountingInboxItemsList({
  items,
  loading,
  isZh,
  busySender,
  classifyingId,
  discardingId,
  confirmingProviderId,
  confirmingOtherId,
  uploadingExpenseEvidenceId,
  removingExpenseEvidenceId,
  beginningExpenseReviewId,
  onTrustSender,
  onIgnoreSender,
  onClassificationChange,
  onUploadExpenseEvidence,
  onRemoveExpenseEvidence,
  onReviewExpense,
  onReviewBankCsv,
  onConfirmProviderFinancial,
  onConfirmOther,
  onDiscard,
  permanentDeleteCapabilities,
  onEvidenceDeleted,
}: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">
        {isZh ? `待处理 ${items.length}` : `${items.length} pending / quarantined`}
      </h2>
      {loading ? (
        <p className="mt-3 text-sm text-slate-500">
          {isZh ? '加载中…' : 'Loading…'}
        </p>
      ) : null}
      {!loading && !items.length ? (
        <p className="py-5 text-sm text-slate-500">
          {isZh ? '当前没有待处理凭证。' : 'Nothing needs review.'}
        </p>
      ) : null}
      <div className="mt-3 divide-y">
        {items.map((item) => {
          const parse = latestParse(item);
          const expenseSource = item.expenseEvidenceSource;
          const gmailMessage = item.gmailMessage;
          const gmailPrimaryEvidence =
            gmailMessage?.primaryExpenseSourceInboxItemStableId == null
              ? null
              : gmailMessage.evidence.find(
                  (member) =>
                    member.inboxItemStableId ===
                    gmailMessage.primaryExpenseSourceInboxItemStableId,
                ) ?? null;
          const expenseParse =
            expenseSource?.artifact.parseRuns[0]?.resultJson ??
            gmailPrimaryEvidence?.artifact.parseRuns[0]?.resultJson ??
            parse;
          const financial = item.artifact.financialDocument;
          const title =
            item.artifact.emailSubject ||
            item.artifact.originalFilename ||
            item.artifact.senderEmail ||
            item.artifact.kind;
          const quarantined = item.status === 'QUARANTINED';
          const manualUploadDeleteCapability =
            permanentDeleteCapabilities.get(item.inboxItemStableId);
          const evidence = item.artifact.storedUrl
            ? {
                artifactStableId: item.artifact.artifactStableId,
                filename: item.artifact.originalFilename,
                kind: item.artifact.kind,
                deletion:
                  manualUploadDeleteCapability === undefined
                    ? null
                    : {
                        inboxItemStableId: item.inboxItemStableId,
                        canPermanentDelete: manualUploadDeleteCapability,
                      },
              }
            : null;
          const expenseSourceEvidence = expenseSource?.artifact.storedUrl
            ? {
                artifactStableId: expenseSource.artifact.artifactStableId,
                filename: expenseSource.artifact.originalFilename,
                kind: expenseSource.artifact.kind,
                deletion: null,
              }
            : null;
          const classificationLocked =
            quarantined ||
            item.status !== 'PENDING_REVIEW' ||
            item.materializedEntityType !== null ||
            expenseSource !== null ||
            item.artifact.acquisitionMode === 'PROVIDER_API';
          const classifying = classifyingId === item.inboxItemStableId;
          const providerDocumentType = validatedProviderFinancialDocumentType(
            item,
            parse,
          );
          const providerSupportingEvidence =
            isProviderSupportingEvidence(providerDocumentType);
          const providerFinancialSuggestionOverridden =
            parse.providerFinancial === true &&
            isProviderSupportingEvidence(parse.documentType) &&
            item.classification === 'OTHER_DOCUMENT';
          const providerSummaryLines = providerEvidenceSummaryLines(item, parse);
          const providerLabel =
            financial?.provider ?? parse.provider ?? item.selectedProvider ?? '—';
          const providerPeriodStart =
            financial?.periodStart ?? parse.periodStart ?? null;
          const providerPeriodEnd = financial?.periodEnd ?? parse.periodEnd ?? null;
          const providerDocumentRef =
            financial?.providerDocumentRef ?? parse.providerDocumentRef ?? null;
          return (
            <div
              key={item.inboxItemStableId}
              className="grid gap-3 py-4 lg:grid-cols-[1.35fr_1fr_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      quarantined
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.status}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {item.artifact.acquisitionMode} · {item.artifact.kind}
                  </span>
                  {gmailMessage && gmailMessage.evidence.length > 1 ? (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      {isZh
                        ? `同封邮件 · ${gmailMessage.evidence.length} 份证据`
                        : `One email · ${gmailMessage.evidence.length} evidence items`}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.artifact.senderEmail
                    ? `${isZh ? '发件人' : 'From'}: ${item.artifact.senderEmail} · `
                    : ''}
                  {new Date(item.createdAt).toLocaleString()}
                </p>

                {!quarantined && item.status === 'PENDING_REVIEW' ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="grid gap-1 text-xs text-slate-500">
                      <span>{isZh ? '资料分类' : 'Inbox classification'}</span>
                      <select
                        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-100"
                        value={item.classification}
                        disabled={classificationLocked || classifying}
                        onChange={(event) => {
                          const classification = event.target
                            .value as AccountingInboxClassification;
                          void onClassificationChange(
                            item,
                            classification,
                            classification === 'PROVIDER_FINANCIAL_DOCUMENT'
                              ? item.selectedProvider
                              : null,
                          );
                        }}
                      >
                        <option value="UNKNOWN">
                          {isZh ? '未确定' : 'Unspecified'}
                        </option>
                        <option
                          value="EXPENSE_DOCUMENT"
                          disabled={parse.requiresBatchExpenseImport === true}
                        >
                          {isZh ? '费用单' : 'Expense / invoice'}
                        </option>
                        <option value="PROVIDER_FINANCIAL_DOCUMENT">
                          {isZh
                            ? '平台财务资料'
                            : 'Provider financial evidence'}
                        </option>
                        <option value="OTHER_DOCUMENT">
                          {isZh
                            ? '银行流水 / 其他资料'
                            : 'Bank statement / other evidence'}
                        </option>
                      </select>
                    </label>
                    {item.classification === 'PROVIDER_FINANCIAL_DOCUMENT' ? (
                      <label className="grid gap-1 text-xs text-slate-500">
                        <span>{isZh ? '平台' : 'Provider'}</span>
                        <select
                          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-100"
                          value={item.selectedProvider ?? ''}
                          disabled={classificationLocked || classifying}
                          onChange={(event) => {
                            const selectedProvider =
                              (event.target.value as AccountingFinancialProvider) ||
                              null;
                            void onClassificationChange(
                              item,
                              'PROVIDER_FINANCIAL_DOCUMENT',
                              selectedProvider,
                            );
                          }}
                        >
                          <option value="">
                            {isZh ? '选择平台' : 'Select provider'}
                          </option>
                          {providerOptions.map((provider) => (
                            <option key={provider.value} value={provider.value}>
                              {provider.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {classifying ? (
                      <span className="pb-1.5 text-xs text-slate-500">
                        {isZh ? '保存中…' : 'Saving…'}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {item.classification === 'EXPENSE_DOCUMENT' &&
                item.expenseEvidenceReadiness.status ===
                  'SUPPLEMENT_REQUIRED' ? (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <strong>
                      {isZh ? '缺少正式会计凭证' : 'Formal source document required'}
                    </strong>
                    <p className="mt-1 leading-5">
                      {item.expenseEvidenceReadiness.reason ===
                      'EMAIL_BILL_NOTIFICATION_ONLY'
                        ? isZh
                          ? '系统识别到这是一封账单通知邮件，而不是完整账单。当前不能进入费用审核或最终入账，请先上传正式账单文件。'
                          : 'This is a bill notification rather than the complete bill. Expense review and confirmation are blocked until the formal source document is uploaded.'
                        : item.expenseEvidenceReadiness.reason ===
                            'EMAIL_BODY_INSUFFICIENT'
                          ? isZh
                            ? '邮件正文不足以独立支持正式费用确认。请补充 PDF、账单图片或其他正式账单文件后再审核。'
                            : 'The email body does not contain enough standalone source evidence. Upload the formal PDF, bill image, or other source document before review.'
                          : isZh
                            ? '已关联的账单文件当前不可作为费用原始凭证，请检查并补充有效账单。'
                            : 'The linked source file is not currently eligible as expense evidence. Review the source and provide a valid bill.'}
                    </p>
                  </div>
                ) : null}

                {item.classification === 'EXPENSE_DOCUMENT' &&
                item.expenseEvidenceReadiness.status === 'READY' &&
                expenseSource ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
                    <strong>
                      {isZh ? '正式账单已补齐' : 'Formal source document linked'}
                    </strong>
                    <p className="mt-1">
                      {expenseSource.artifact.originalFilename ??
                        expenseSource.artifact.artifactStableId}
                    </p>
                  </div>
                ) : null}

                {parse.excludedBeforeFinancialHistory ? (
                  <p className="mt-2 text-xs text-amber-700">
                    {isZh
                      ? `系统识别为平台财务资料，但期间早于财务起始边界 ${parse.financialHistoryRequiredFrom ?? '2026-06-01'}。你仍可人工修改资料类型。`
                      : `System recognition found provider financial evidence before the ${parse.financialHistoryRequiredFrom ?? '2026-06-01'} history boundary. You can still change the document type manually.`}
                  </p>
                ) : parse.providerRecognitionAmbiguousRuleStableIds?.length ? (
                  <p className="mt-2 text-xs text-amber-700">
                    {isZh
                      ? '多个平台识别规则以相同优先级同时命中，系统未自动选择类型/平台，请人工确认。'
                      : 'Multiple provider recognition rules matched at the same priority. No automatic provider/type was selected; review it manually.'}
                  </p>
                ) : parse.structuredExpenseCsv ? (
                  <p
                    className={`mt-2 text-xs ${
                      parse.requiresBatchExpenseImport
                        ? 'text-amber-700'
                        : 'text-blue-700'
                    }`}
                  >
                    {parse.requiresBatchExpenseImport
                      ? isZh
                        ? `识别到结构化费用 CSV：${parse.structuredExpenseRowCount ?? 0} 条有效记录${parse.structuredExpenseInvalidRowCount ? `，${parse.structuredExpenseInvalidRowCount} 条异常记录` : ''}。当前不会把整份文件误确认为单笔费用，需后续批量费用导入流程处理。`
                        : `Structured expense CSV detected: ${parse.structuredExpenseRowCount ?? 0} valid rows${parse.structuredExpenseInvalidRowCount ? ` and ${parse.structuredExpenseInvalidRowCount} invalid rows` : ''}. It is blocked from single-expense confirmation and needs the batch-expense import flow.`
                      : isZh
                        ? '识别到单行结构化费用 CSV，可按普通费用审核。'
                        : 'Single-row structured expense CSV detected; it can be reviewed as an ordinary expense.'}
                  </p>
                ) : parse.csvStructureUnrecognized ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {isZh
                      ? 'CSV 结构无法可靠识别，已保留原始文件，请人工选择资料类型。'
                      : 'CSV structure was not recognized reliably. The raw evidence is preserved for manual classification.'}
                  </p>
                ) : parse.providerParserPending ? (
                  <p className="mt-2 text-xs text-blue-700">
                    {isZh
                      ? 'CSV 已保留，等待平台财务解析。'
                      : 'CSV preserved for provider financial parsing.'}
                  </p>
                ) : parse.providerFinancial || parse.providerRecognition ? (
                  <p className="mt-2 text-xs text-blue-700">
                    {isZh ? '系统建议' : 'System suggestion'}:{' '}
                    {parse.provider ?? '—'} · {parse.documentType ?? '—'}
                    {providerSupportingEvidence
                      ? isZh
                        ? ' · 辅助 / 控制证据（确认后直接归档）'
                        : ' · supporting / control evidence (archived after confirmation)'
                      : ''}
                    {parse.periodStart || parse.periodEnd
                      ? ` · ${parse.periodStart ?? '—'} → ${parse.periodEnd ?? '—'}`
                      : ''}
                    {parse.providerRecognition && !parse.providerFinancial
                      ? isZh
                        ? ' · 已命中识别规则，财务字段尚未验证'
                        : ' · recognition matched; financial fields not yet validated'
                      : ''}
                  </p>
                ) : parse.reviewDisposition ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {isZh ? '系统建议' : 'System suggestion'}:{' '}
                    {parse.reviewDisposition}
                    {parse.confidence ? ` · ${parse.confidence}` : ''}
                  </p>
                ) : null}
                {providerFinancialSuggestionOverridden ? (
                  <p className="mt-2 text-xs text-amber-700">
                    {isZh
                      ? '系统已验证这是一份平台辅助 / 控制证据。若保持“其他”，只会作为普通资料审核，不会参与对应平台的财务核对；如需保留其平台核对语义，请改回“平台财务资料”并选择正确平台。'
                      : 'The system validated this as supporting / control provider evidence. Keeping it as Other treats it as generic evidence and excludes it from provider reconciliation; to preserve its provider-reconciliation role, switch back to Provider financial evidence and select the correct provider.'}
                  </p>
                ) : null}
              </div>

              <div className="text-sm text-slate-600">
                {providerSupportingEvidence ? (
                  <div className="mb-2 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-cyan-950">
                        {isZh
                          ? '辅助 / 控制证据 · 确认后直接归档'
                          : 'Supporting / control evidence · archive after confirmation'}
                      </p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-cyan-800">
                        {providerLabel} · {providerDocumentType}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
                      {providerPeriodStart || providerPeriodEnd ? (
                        <span>
                          {isZh ? '期间' : 'Period'}:{' '}
                          <strong>
                            {providerPeriodStart ?? '—'} → {providerPeriodEnd ?? '—'}
                          </strong>
                        </span>
                      ) : null}
                      {providerDocumentRef ? (
                        <span>
                          {isZh ? '平台参考号' : 'Provider ref'}:{' '}
                          <strong className="font-mono">{providerDocumentRef}</strong>
                        </span>
                      ) : null}
                    </div>
                    {providerSummaryLines.length ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {providerSummaryLines.map((line, index) => (
                          <div
                            key={
                              'lineStableId' in line
                                ? line.lineStableId
                                : `${line.rawName ?? line.component}-${index}`
                            }
                            className="rounded border border-cyan-100 bg-white px-2.5 py-2 text-xs"
                          >
                            <p className="text-slate-500">
                              {line.rawName ?? line.component}
                            </p>
                            <p className="mt-0.5 font-semibold text-slate-900">
                              {money(line.amountCents)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-2 text-xs leading-5 text-cyan-900">
                      {isZh
                        ? '这份文件只用于月结、到账或平台数据核对，不作为独立结算工作项。确认后会直接作为受保护的辅助证据入库，无需再到“平台结算”进行后续操作。'
                        : 'This file supports statement, payout, or provider-data reconciliation and is not an independent settlement work item. After confirmation it is archived as protected supporting evidence; no further action is required in Provider settlements.'}
                    </p>
                  </div>
                ) : financial ? (
                  <div className="mb-2 space-y-1">
                    <p className="font-medium text-slate-800">
                      {financial.provider} · {financial.documentType} · v
                      {financial.revision}
                    </p>
                    {financial.periodStart || financial.periodEnd ? (
                      <p className="text-xs">
                        {isZh ? '期间' : 'Period'}: {financial.periodStart ?? '—'} →{' '}
                        {financial.periodEnd ?? '—'}
                      </p>
                    ) : null}
                    <p className="text-xs font-medium text-slate-500">
                      {isZh ? '识别条目' : 'Recognized items'}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {financial.lines.slice(0, 6).map((line) => (
                        <span key={line.lineStableId}>
                          {line.rawName ?? line.component}: {money(line.amountCents)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : parse.providerFinancial && parse.lines?.length ? (
                  <div className="mb-2 space-y-1">
                    <p className="text-xs font-medium text-slate-700">
                      {isZh ? '系统提取预览' : 'System extraction preview'}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {parse.lines.slice(0, 6).map((line, index) => (
                        <span key={`${line.rawName ?? line.component}-${index}`}>
                          {line.rawName ?? line.component}: {money(line.amountCents)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : parse.structuredExpenseRows?.length ? (
                  <div className="mb-2 space-y-1">
                    <p className="text-xs font-medium text-slate-700">
                      {isZh ? '结构化费用预览' : 'Structured expense preview'}
                    </p>
                    <div className="space-y-1 text-xs">
                      {parse.structuredExpenseRows.slice(0, 6).map((row) => (
                        <p key={row.rowNumber}>
                          #{row.rowNumber} · {row.occurredAt} ·{' '}
                          <strong>{money(row.totalCents)}</strong>
                          {row.counterparty ? ` · ${row.counterparty}` : ''}
                          {row.description ? ` · ${row.description}` : ''}
                        </p>
                      ))}
                      {parse.structuredExpenseRowCount &&
                      parse.structuredExpenseRowCount > 6 ? (
                        <p className="text-slate-500">
                          {isZh
                            ? `另有 ${parse.structuredExpenseRowCount - 6} 条记录未展开。`
                            : `${parse.structuredExpenseRowCount - 6} more rows not shown.`}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : expenseParse.date ||
                  expenseParse.subtotalCents != null ||
                  expenseParse.taxCents != null ||
                  expenseParse.totalCents != null ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <strong>
                      {isZh ? '费用识别结果' : 'Recognized expense fields'}
                    </strong>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        {isZh ? '日期' : 'Date'}: <strong>{expenseParse.date ?? '—'}</strong>
                      </span>
                      <span>
                        {isZh ? '分类' : 'Category'}:{' '}
                        <strong>{expenseParse.suggestedCategoryName ?? '—'}</strong>
                      </span>
                      <span>
                        {isZh ? '税前' : 'Subtotal'}:{' '}
                        <strong>
                          {expenseParse.subtotalCents == null
                            ? '—'
                            : money(expenseParse.subtotalCents)}
                        </strong>
                      </span>
                      <span>
                        {isZh ? '税' : 'Tax'}:{' '}
                        <strong>
                          {expenseParse.taxCents == null ? '—' : money(expenseParse.taxCents)}
                        </strong>
                      </span>
                      <span>
                        {isZh ? '总额' : 'Total'}:{' '}
                        <strong>
                          {expenseParse.totalCents == null ? '—' : money(expenseParse.totalCents)}
                        </strong>
                      </span>
                      <span>
                        {isZh ? '引擎' : 'Engine'}:{' '}
                        <strong>
                          {expenseParse.textRecognitionEngine ?? expenseParse.ocrEngine ?? '—'}
                        </strong>
                      </span>
                      <span>
                        {isZh ? '识别置信度' : 'Recognition confidence'}:{' '}
                        <strong>{expenseParse.confidence ?? '—'}</strong>
                      </span>
                    </div>
                  </div>
                ) : null}
                {gmailMessage && gmailMessage.evidence.length > 1 ? (
                  <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                    <p className="text-xs font-semibold text-blue-900">
                      {isZh
                        ? '同一封 Gmail · 正文与附件合并审核'
                        : 'One Gmail message · body and attachments grouped'}
                    </p>
                    <div className="mt-2 space-y-2">
                      {gmailMessage.evidence.map((member) => {
                        const memberTitle =
                          member.artifact.originalFilename ??
                          (member.artifact.kind === 'EMAIL_BODY'
                            ? isZh
                              ? '邮件正文'
                              : 'Email body'
                            : member.artifact.kind);
                        return (
                          <div
                            key={member.inboxItemStableId}
                            className="rounded border border-blue-100 bg-white px-2.5 py-2 text-xs"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-slate-800">
                                {memberTitle}
                              </span>
                              {member.isPrimaryExpenseSource ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                                  {isZh
                                    ? '费用主凭证'
                                    : 'Primary expense source'}
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                                  {isZh ? '辅助证据' : 'Supporting evidence'}
                                </span>
                              )}
                            </div>
                            {member.artifact.storedUrl ? (
                              <div className="mt-1">
                                <AccountingEvidenceViewer
                                  evidence={{
                                    artifactStableId:
                                      member.artifact.artifactStableId,
                                    filename:
                                      member.artifact.originalFilename,
                                    kind: member.artifact.kind,
                                    deletion: null,
                                  }}
                                  isZh={isZh}
                                  onDeleted={onEvidenceDeleted}
                                  label={
                                    member.isPrimaryExpenseSource
                                      ? isZh
                                        ? '查看正式账单'
                                        : 'Open primary bill'
                                      : isZh
                                        ? '查看附件'
                                        : 'Open attachment'
                                  }
                                  className="text-blue-600 hover:underline"
                                />
                              </div>
                            ) : member.artifact.bodyText ? (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-blue-600">
                                  {isZh
                                    ? '查看邮件正文'
                                    : 'View email body'}
                                </summary>
                                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                                  {member.artifact.bodyText}
                                </pre>
                              </details>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {expenseSourceEvidence ? (
                  <div className="mb-2">
                    <AccountingEvidenceViewer
                      evidence={expenseSourceEvidence}
                      isZh={isZh}
                      onDeleted={onEvidenceDeleted}
                      label={isZh ? '查看正式账单' : 'Open formal source document'}
                      className="font-medium text-emerald-700 hover:underline"
                    />
                  </div>
                ) : null}
                {!gmailMessage && evidence ? (
                  <AccountingEvidenceViewer
                    evidence={evidence}
                    isZh={isZh}
                    onDeleted={onEvidenceDeleted}
                    label={isZh ? '查看证据' : 'Open evidence'}
                    className="text-blue-600 hover:underline"
                  />
                ) : !gmailMessage && item.artifact.bodyText ? (
                  <details>
                    <summary className="cursor-pointer text-blue-600">
                      {isZh ? '查看邮件正文' : 'View email body'}
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                      {item.artifact.bodyText}
                    </pre>
                  </details>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                {quarantined && item.artifact.senderEmail ? (
                  <>
                    <button
                      disabled={busySender}
                      onClick={() =>
                        void onTrustSender(item.artifact.senderEmail ?? '')
                      }
                      className="rounded border px-3 py-1.5 text-sm text-emerald-700 disabled:opacity-50"
                    >
                      {isZh ? '信任此发件人' : 'Trust sender'}
                    </button>
                    <button
                      disabled={busySender}
                      onClick={() =>
                        void onIgnoreSender(item.artifact.senderEmail ?? '')
                      }
                      className="rounded border px-3 py-1.5 text-sm text-amber-700 disabled:opacity-50"
                    >
                      {isZh ? '忽略此发件人' : 'Ignore sender'}
                    </button>
                  </>
                ) : null}
                {!quarantined &&
                item.status === 'PENDING_REVIEW' &&
                item.classification === 'PROVIDER_FINANCIAL_DOCUMENT' &&
                item.selectedProvider ? (
                  <div className="max-w-sm text-right">
                    <button
                      disabled={confirmingProviderId === item.inboxItemStableId}
                      onClick={() => void onConfirmProviderFinancial(item)}
                      className="rounded border px-3 py-1.5 text-sm text-emerald-700 disabled:opacity-50"
                    >
                      {confirmingProviderId === item.inboxItemStableId
                        ? isZh
                          ? '确认中…'
                          : 'Confirming…'
                        : providerSupportingEvidence
                          ? isZh
                            ? '确认识别并归档'
                            : 'Confirm recognition & archive'
                          : isZh
                            ? '确认识别并进入审核'
                            : 'Confirm recognition & enter review'}
                    </button>
                    <p className="mt-1 text-xs text-slate-500">
                      {providerSupportingEvidence
                        ? isZh
                          ? '这里只确认文件类型、条目名称和识别数字大致正确；辅助 / 控制证据确认后直接归档。'
                          : 'This step only confirms that the detected file type, item names, and recognized amounts are broadly correct; supporting/control evidence is then archived.'
                        : isZh
                          ? '这里只确认识别内容大致正确，不做核算、不记账；确认后进入“平台结算”审核程序。'
                          : 'This step only confirms that recognition is broadly correct. No reconciliation or posting happens here; confirmation moves the statement into Provider settlements review.'}
                    </p>
                  </div>
                ) : null}
                {!quarantined &&
                item.status === 'PENDING_REVIEW' &&
                item.classification === 'EXPENSE_DOCUMENT' &&
                item.expenseEvidenceReadiness.status ===
                  'SUPPLEMENT_REQUIRED' &&
                item.artifact.kind === 'EMAIL_BODY' ? (
                  <div className="max-w-sm text-right">
                    <div className="mb-2 flex flex-wrap justify-end gap-2">
                      <button
                        disabled
                        className="cursor-not-allowed rounded border px-3 py-1.5 text-sm text-slate-400 opacity-70"
                      >
                        {isZh
                          ? '确认识别并进入审核'
                          : 'Confirm recognition & enter review'}
                      </button>
                    </div>
                    {expenseSource ? (
                      <button
                        disabled={
                          removingExpenseEvidenceId === item.inboxItemStableId
                        }
                        onClick={() => void onRemoveExpenseEvidence(item)}
                        className="rounded border px-3 py-1.5 text-sm text-amber-800 disabled:opacity-50"
                      >
                        {removingExpenseEvidenceId === item.inboxItemStableId
                          ? isZh
                            ? '移除中…'
                            : 'Removing…'
                          : isZh
                            ? '移除无效账单并重新上传'
                            : 'Remove invalid source and upload again'}
                      </button>
                    ) : (
                      <label className="inline-flex cursor-pointer rounded border px-3 py-1.5 text-sm text-amber-800">
                        {uploadingExpenseEvidenceId === item.inboxItemStableId
                          ? isZh
                            ? '上传处理中…'
                            : 'Uploading…'
                          : isZh
                            ? '上传正式账单'
                            : 'Upload formal bill'}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.csv,.xlsx,image/jpeg,image/png,image/webp"
                          disabled={
                            uploadingExpenseEvidenceId === item.inboxItemStableId
                          }
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = '';
                            if (file) void onUploadExpenseEvidence(item, file);
                          }}
                        />
                      </label>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {expenseSource
                        ? isZh
                          ? '当前关联文件不可用于最终费用确认。请先移除，再上传正确的正式账单。'
                          : 'The linked source is not eligible for final expense confirmation. Remove it before uploading the correct bill.'
                        : isZh
                          ? '上传后文件会与这封通知邮件关联；凭证补齐前不能进入费用审核。'
                          : 'The uploaded file is linked to this notification. Expense review stays blocked until source evidence is present.'}
                    </p>
                  </div>
                ) : null}
                {!quarantined &&
                item.status === 'PENDING_REVIEW' &&
                item.classification === 'EXPENSE_DOCUMENT' &&
                item.expenseEvidenceReadiness.status === 'READY' &&
                expenseParse.requiresBatchExpenseImport !== true ? (
                  <div className="max-w-sm text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        disabled={
                          beginningExpenseReviewId === item.inboxItemStableId
                        }
                        onClick={() => void onReviewExpense(item)}
                        className="rounded border px-3 py-1.5 text-sm text-blue-700 disabled:opacity-50"
                      >
                        {beginningExpenseReviewId === item.inboxItemStableId
                          ? isZh
                            ? '移入审核中…'
                            : 'Starting review…'
                          : isZh
                            ? '确认识别并进入审核'
                            : 'Confirm recognition & enter review'}
                      </button>
                      {expenseSource ? (
                        <button
                          disabled={
                            removingExpenseEvidenceId === item.inboxItemStableId
                          }
                          onClick={() => void onRemoveExpenseEvidence(item)}
                          className="rounded border px-3 py-1.5 text-sm text-amber-700 disabled:opacity-50"
                        >
                          {removingExpenseEvidenceId === item.inboxItemStableId
                            ? isZh
                              ? '移除中…'
                              : 'Removing…'
                            : isZh
                              ? '更换正式账单'
                              : 'Replace source bill'}
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {isZh
                        ? '这里只确认识别到的文件类型、条目和数字大致正确；点击后进入费用审核，核算与最终确认都在审核阶段完成。'
                        : 'This step only confirms that the detected file type, items, and amounts are broadly correct. Reconciliation and final confirmation happen in expense review.'}
                    </p>
                  </div>
                ) : null}
                {!quarantined &&
                item.status === 'PENDING_REVIEW' &&
                item.artifact.kind === 'CSV' &&
                (item.classification === 'OTHER_DOCUMENT' ||
                  item.classification === 'UNKNOWN') ? (
                  <button
                    onClick={() => onReviewBankCsv(item)}
                    className="rounded border px-3 py-1.5 text-sm text-cyan-700"
                  >
                    {isZh
                      ? '确认识别并进入银行审核'
                      : 'Confirm recognition & enter bank review'}
                  </button>
                ) : null}
                {!quarantined &&
                item.status === 'PENDING_REVIEW' &&
                item.classification === 'OTHER_DOCUMENT' ? (
                  <button
                    disabled={confirmingOtherId === item.inboxItemStableId}
                    onClick={() => void onConfirmOther(item)}
                    className="rounded border px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
                  >
                    {confirmingOtherId === item.inboxItemStableId
                      ? isZh
                        ? '确认中…'
                        : 'Confirming…'
                      : isZh
                        ? '标记已审核'
                        : 'Mark reviewed'}
                  </button>
                ) : null}
                {item.materializedEntityType !== 'PROVIDER_FINANCIAL_DOCUMENT' &&
                !expenseSource ? (
                  <button
                    disabled={discardingId === item.inboxItemStableId}
                    onClick={() => void onDiscard(item)}
                    className="rounded border px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
                  >
                    {discardingId === item.inboxItemStableId
                      ? isZh
                        ? '处理中…'
                        : 'Working…'
                      : isZh
                        ? '放弃处理'
                        : 'Abandon'}
                  </button>
                ) : null}
              </div>

            </div>
          );
        })}
      </div>
    </section>
  );
}
