'use client';

import { AccountingEvidenceViewer } from '../accounting-evidence-viewer';
import type { AccountingFinancialProvider } from '../contracts/core';
import type {
  AccountingInboxClassification,
  AccountingInboxItem,
  AccountingManualUploadPermanentDeleteResult,
} from '../contracts/inbox';
import { ProviderFinancialReviewPanel } from '../provider-financial-review-panel';
import { latestParse, money } from './inbox-model';

type Props = {
  items: AccountingInboxItem[];
  loading: boolean;
  isZh: boolean;
  busySender: boolean;
  classifyingId: string | null;
  discardingId: string | null;
  confirmingProviderId: string | null;
  confirmingOtherId: string | null;
  onTrustSender: (email: string) => Promise<void>;
  onClassificationChange: (
    item: AccountingInboxItem,
    classification: AccountingInboxClassification,
    selectedProvider: AccountingFinancialProvider | null,
  ) => Promise<void>;
  onReviewExpense: (item: AccountingInboxItem) => void;
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
  onTrustSender,
  onClassificationChange,
  onReviewExpense,
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
          const classificationLocked =
            quarantined ||
            item.status !== 'PENDING_REVIEW' ||
            item.materializedEntityType !== null ||
            item.artifact.acquisitionMode === 'PROVIDER_API';
          const classifying = classifyingId === item.inboxItemStableId;
          const providerSupplementaryEvidence =
            parse.providerFinancial === true && parse.documentType === 'OTHER';
          const providerFinancialSuggestionOverridden =
            providerSupplementaryEvidence &&
            item.classification === 'OTHER_DOCUMENT';
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
                          {isZh ? '其他资料（非平台财务）' : 'Other evidence'}
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
                    {providerSupplementaryEvidence
                      ? isZh
                        ? ' · 补充证据（不单独入账）'
                        : ' · supporting evidence (not posted independently)'
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
                      ? '系统已识别这是一份平台财务补充证据。若保持“其他”，只会作为普通其他资料审核，不会参与平台结算匹配；如需用于 Fantuan 月结，请改回“平台财务资料”并选择 Fantuan。'
                      : 'The system identified this as supporting provider financial evidence. Keeping it as Other only reviews it as generic evidence and excludes it from provider-settlement matching; for Fantuan settlement use, switch back to Provider financial evidence and select Fantuan.'}
                  </p>
                ) : null}
              </div>

              <div className="text-sm text-slate-600">
                {financial ? (
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
                ) : parse.totalCents != null ? (
                  <p>
                    {isZh ? '识别总额' : 'Detected total'}:{' '}
                    <strong>{money(parse.totalCents)}</strong>
                  </p>
                ) : null}
                {evidence ? (
                  <AccountingEvidenceViewer
                    evidence={evidence}
                    isZh={isZh}
                    onDeleted={onEvidenceDeleted}
                    label={isZh ? '查看证据' : 'Open evidence'}
                    className="text-blue-600 hover:underline"
                  />
                ) : item.artifact.bodyText ? (
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
                  <button
                    disabled={busySender}
                    onClick={() =>
                      void onTrustSender(item.artifact.senderEmail ?? '')
                    }
                    className="rounded border px-3 py-1.5 text-sm text-emerald-700 disabled:opacity-50"
                  >
                    {isZh ? '信任此发件人' : 'Trust sender'}
                  </button>
                ) : null}
                {!quarantined &&
                item.status === 'PENDING_REVIEW' &&
                item.classification === 'PROVIDER_FINANCIAL_DOCUMENT' &&
                item.selectedProvider ? (
                  <button
                    disabled={confirmingProviderId === item.inboxItemStableId}
                    onClick={() => void onConfirmProviderFinancial(item)}
                    className="rounded border px-3 py-1.5 text-sm text-emerald-700 disabled:opacity-50"
                  >
                    {confirmingProviderId === item.inboxItemStableId
                      ? isZh
                        ? '确认中…'
                        : 'Confirming…'
                      : isZh
                        ? '确认平台财务资料'
                        : 'Confirm provider financial evidence'}
                  </button>
                ) : null}
                {!quarantined &&
                item.status === 'PENDING_REVIEW' &&
                item.classification === 'EXPENSE_DOCUMENT' &&
                parse.requiresBatchExpenseImport !== true ? (
                  <button
                    onClick={() => onReviewExpense(item)}
                    className="rounded border px-3 py-1.5 text-sm text-blue-700"
                  >
                    {isZh ? '审核费用' : 'Review expense'}
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
                {item.materializedEntityType !== 'PROVIDER_FINANCIAL_DOCUMENT' ? (
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

              {financial &&
              item.materializedEntityType ===
                'PROVIDER_FINANCIAL_DOCUMENT' &&
              item.status === 'PENDING_REVIEW' ? (
                <div className="lg:col-span-3">
                  <ProviderFinancialReviewPanel
                    document={financial}
                    evidence={evidence}
                    parseResult={parse}
                    isZh={isZh}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
