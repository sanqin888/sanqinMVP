'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type {
  AccountingProviderFinancialConfirmationResult,
} from '../contracts/provider-financial';
import { AccountingInboxBankCsvReviewPanel } from './bank-csv-review-panel';
import { AccountingInboxExpenseReviewPanel } from './expense-review-panel';
import { AccountingImageRetentionPanel } from './image-retention-panel';
import { AccountingImageRetentionQueue } from './image-retention-queue';
import { AccountingInboxItemsList } from './inbox-items-list';
import { AccountingManualUploadLibrary } from './manual-upload-library';
import {
  findAccountingInboxItemByStableId,
  retainReviewingInboxItemStableId,
} from './reviewing-inbox-item';
import type { AccountingAccount, AccountingCategory } from '../contracts/chart';
import type { AccountingFinancialProvider } from '../contracts/core';
import type {
  AccountingApplySenderPolicyResult,
  AccountingImageRetentionAccepted,
  AccountingImageRetentionQueueItem,
  AccountingInboxClassification,
  AccountingInboxItem,
  AccountingManualUploadLibraryItem,
  AccountingManualUploadPermanentDeleteResult,
  AccountingManualUploadResult,
  AccountingSenderPolicy,
  AccountingSenderPolicyDecision,
} from '../contracts/inbox';

export default function AccountingInboxPage() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const isZh = locale === 'zh';
  const [items, setItems] = useState<AccountingInboxItem[]>([]);
  const [manualUploads, setManualUploads] = useState<
    AccountingManualUploadLibraryItem[]
  >([]);
  const permanentDeleteCapabilities = useMemo(
    () =>
      new Map<string, boolean>(
        manualUploads.map(
          (item) =>
            [item.inboxItemStableId, item.canPermanentDelete] as const,
        ),
      ),
    [manualUploads],
  );
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [senderPolicies, setSenderPolicies] = useState<
    AccountingSenderPolicy[]
  >([]);
  const [imageRetentionQueue, setImageRetentionQueue] = useState<
    AccountingImageRetentionQueueItem[]
  >([]);
  const [reviewingInboxItemStableId, setReviewingInboxItemStableId] = useState<
    string | null
  >(null);
  const [reviewingBankCsvInboxItemStableId, setReviewingBankCsvInboxItemStableId] =
    useState<string | null>(null);
  const reviewing = findAccountingInboxItemByStableId(
    items,
    reviewingInboxItemStableId,
  );
  const reviewingBankCsv = findAccountingInboxItemByStableId(
    items,
    reviewingBankCsvInboxItemStableId,
  );
  const knownStoreStableIds = useMemo(
    () =>
      Array.from(
        new Set(
          items.flatMap((item) => {
            const storeStableId = item.artifact.financialDocument?.storeStableId;
            return storeStableId ? [storeStableId] : [];
          }),
        ),
      ).sort(),
    [items],
  );
  const [optimizingImage, setOptimizingImage] =
    useState<AccountingImageRetentionQueueItem | null>(null);
  const [senderEmail, setSenderEmail] = useState('');
  const [senderLabel, setSenderLabel] = useState('');
  const [senderDecision, setSenderDecision] =
    useState<AccountingSenderPolicyDecision>('TRUSTED');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [busySender, setBusySender] = useState(false);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);
  const [confirmingProviderId, setConfirmingProviderId] = useState<string | null>(
    null,
  );
  const [confirmingOtherId, setConfirmingOtherId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [
    confirmedProviderDocumentStableId,
    setConfirmedProviderDocumentStableId,
  ] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inbox, uploads, cats, accts, senders, retentionQueue] =
        await Promise.all([
          apiFetch<AccountingInboxItem[]>('/accounting/inbox?limit=100'),
          apiFetch<AccountingManualUploadLibraryItem[]>(
            '/accounting/inbox/manual-uploads?limit=200',
          ),
          apiFetch<AccountingCategory[]>('/accounting/categories'),
          apiFetch<AccountingAccount[]>('/accounting/accounts'),
          apiFetch<AccountingSenderPolicy[]>(
            '/accounting/inbox/sender-policies',
          ),
          apiFetch<AccountingImageRetentionQueueItem[]>(
            '/accounting/inbox/image-retention/pending?limit=100',
          ),
        ]);
      setItems(inbox);
      setReviewingInboxItemStableId((currentStableId) =>
        retainReviewingInboxItemStableId(inbox, currentStableId),
      );
      setManualUploads(uploads);
      setCategories(cats);
      setAccounts(accts);
      setSenderPolicies(senders);
      setImageRetentionQueue(retentionQueue);
      return { retentionQueue };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadEvidence(file: File) {
    setUploading(true);
    setError(null);
    setMessage(null);
    setConfirmedProviderDocumentStableId(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiFetch<AccountingManualUploadResult>(
        '/accounting/inbox/artifacts',
        {
          method: 'POST',
          body: formData,
        },
      );
      if (result.duplicateOfArtifactStableId) {
        setMessage(
          result.duplicateStorageCleanupComplete === false
            ? isZh
              ? '检测到重复文件，未创建新的财务证据记录；但本次临时物理文件清理失败，服务器日志已记录待清理路径。'
              : 'Duplicate file detected and no new evidence record was created, but temporary binary cleanup failed. The server log records the cleanup path.'
            : isZh
              ? '检测到重复文件：未创建新的财务证据记录，也不会保留第二份物理文件。'
              : 'Duplicate file detected. No new evidence record or second binary copy was retained.',
        );
      } else {
        setMessage(
          isZh ? '文件已进入财务收件箱。' : 'Evidence added to Accounting Inbox.',
        );
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUploading(false);
    }
  }

  function existingSenderPolicyLabel(email: string) {
    const normalized = email.trim().toLowerCase();
    return (
      senderPolicies.find((sender) => sender.email === normalized)?.label ?? ''
    );
  }

  async function saveSenderPolicy(
    email = senderEmail,
    label = senderLabel,
    decision: AccountingSenderPolicyDecision = senderDecision,
  ) {
    if (!email.trim()) return;
    if (
      decision === 'IGNORED' &&
      !window.confirm(
        isZh
          ? '忽略后，当前仍在隔离区的该发件人邮件会退出收件箱，今后的邮件也不会进入财务收件箱；以后恢复信任不会自动补拉忽略期间的旧邮件。确定继续吗？'
          : 'Ignoring this sender removes its current quarantined mail from the active Inbox and skips future Accounting intake. Restoring trust later will not backfill mail skipped while ignored. Continue?',
      )
    ) {
      return;
    }
    setBusySender(true);
    setError(null);
    setMessage(null);
    setConfirmedProviderDocumentStableId(null);
    try {
      const result = await apiFetch<AccountingApplySenderPolicyResult>(
        '/accounting/inbox/sender-policies',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            label: label.trim() || null,
            decision,
          }),
        },
      );
      setSenderEmail('');
      setSenderLabel('');
      setSenderDecision('TRUSTED');
      if (decision === 'TRUSTED') {
        setMessage(
          isZh
            ? `已信任此发件人；${result.reprocessedArtifacts} 条已隔离证据已立即重新识别${result.reprocessFailures ? `，${result.reprocessFailures} 条重识别失败，请查看服务器日志` : ''}。`
            : `Sender trusted. ${result.reprocessedArtifacts} quarantined artifact(s) were reprocessed immediately${result.reprocessFailures ? `; ${result.reprocessFailures} failed and were logged` : ''}.`,
        );
      } else if (decision === 'IGNORED') {
        setMessage(
          isZh
            ? `已忽略此发件人；${result.quarantine.discardedInboxItemStableIds.length} 条当前隔离记录已移出收件箱，今后的邮件不会进入财务收件箱。`
            : `Sender ignored. ${result.quarantine.discardedInboxItemStableIds.length} quarantined item(s) were removed from the active Inbox and future mail will not enter Accounting Inbox.`,
        );
      } else {
        setMessage(
          isZh
            ? '发件人已设为未识别；今后的邮件会进入隔离区等待人工决定。'
            : 'Sender reset to unrecognized. Future mail will enter quarantine for manual review.',
        );
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusySender(false);
    }
  }

  async function updateClassification(
    item: AccountingInboxItem,
    classification: AccountingInboxClassification,
    selectedProvider: AccountingFinancialProvider | null,
  ) {
    setClassifyingId(item.inboxItemStableId);
    setError(null);
    setMessage(null);
    setConfirmedProviderDocumentStableId(null);
    try {
      await apiFetch(`/accounting/inbox/${item.inboxItemStableId}/classification`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classification, selectedProvider }),
      });
      if (
        reviewingInboxItemStableId === item.inboxItemStableId &&
        classification !== 'EXPENSE_DOCUMENT'
      ) {
        setReviewingInboxItemStableId(null);
      }
      if (
        reviewingBankCsvInboxItemStableId === item.inboxItemStableId &&
        (item.artifact.kind !== 'CSV' ||
          (classification !== 'OTHER_DOCUMENT' && classification !== 'UNKNOWN'))
      ) {
        setReviewingBankCsvInboxItemStableId(null);
      }
      setMessage(
        isZh ? '资料类型已更新。' : 'Document classification updated.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setClassifyingId(null);
    }
  }

  async function confirmProviderFinancial(item: AccountingInboxItem) {
    setConfirmingProviderId(item.inboxItemStableId);
    setError(null);
    setMessage(null);
    setConfirmedProviderDocumentStableId(null);
    try {
      const result =
        await apiFetch<AccountingProviderFinancialConfirmationResult>(
          `/accounting/inbox/${item.inboxItemStableId}/provider-financial/confirm`,
          { method: 'POST' },
        );
      const confirmedDocumentType =
        result.documentType ?? item.artifact.financialDocument?.documentType;
      const supportingEvidence =
        confirmedDocumentType !== undefined &&
        confirmedDocumentType !== 'STATEMENT';
      setConfirmedProviderDocumentStableId(
        supportingEvidence ? null : result.documentStableId,
      );
      setMessage(
        supportingEvidence
          ? isZh
            ? '辅助 / 控制证据已确认并直接入库；关键数据会保留用于后续核对，不进入独立结算流程，无需进一步操作。'
            : 'Supporting / control evidence confirmed and archived. Key data remains available for reconciliation; it does not enter an independent settlement flow and requires no further action.'
          : isZh
            ? '平台财务资料已确认并移至“平台结算”；当前不会因此自动生成会计分录。'
            : 'Provider financial evidence confirmed and moved to Provider settlements; this does not post a journal entry.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setConfirmingProviderId(null);
    }
  }

  async function confirmOther(item: AccountingInboxItem) {
    setConfirmingOtherId(item.inboxItemStableId);
    setError(null);
    setMessage(null);
    setConfirmedProviderDocumentStableId(null);
    try {
      await apiFetch(`/accounting/inbox/${item.inboxItemStableId}/other/confirm`, {
        method: 'POST',
      });
      setMessage(
        isZh ? '其他资料已标记为已审核。' : 'Other evidence marked as reviewed.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setConfirmingOtherId(null);
    }
  }

  async function discard(item: { inboxItemStableId: string }) {
    setDiscardingId(item.inboxItemStableId);
    setError(null);
    setMessage(null);
    setConfirmedProviderDocumentStableId(null);
    try {
      await apiFetch(`/accounting/inbox/${item.inboxItemStableId}`, {
        method: 'DELETE',
      });
      if (reviewingInboxItemStableId === item.inboxItemStableId) {
        setReviewingInboxItemStableId(null);
      }
      if (reviewingBankCsvInboxItemStableId === item.inboxItemStableId) {
        setReviewingBankCsvInboxItemStableId(null);
      }
      setMessage(
        isZh
          ? '已放弃处理；文件仍保留在“上传文件库”，如确认无用可再永久删除。'
          : 'Processing abandoned. The file remains in Upload library and can be permanently deleted later if it is not needed.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDiscardingId(null);
    }
  }

  async function handlePermanentDeleteResult(
    result: AccountingManualUploadPermanentDeleteResult,
  ) {
    if (reviewingInboxItemStableId === result.inboxItemStableId) {
      setReviewingInboxItemStableId(null);
    }
    if (reviewingBankCsvInboxItemStableId === result.inboxItemStableId) {
      setReviewingBankCsvInboxItemStableId(null);
    }
    setMessage(
      result.storageCleanupComplete
        ? isZh
          ? '未确认文件及相关数据库记录已永久删除。'
          : 'The unconfirmed file and its related database records were permanently deleted.'
        : isZh
          ? '数据库记录已永久删除，但有物理文件清理失败；服务器日志已记录待清理路径。'
          : 'Database records were permanently deleted, but some physical file cleanup failed. The server log records the cleanup path.',
    );
    await load();
  }

  async function permanentlyDeleteUpload(item: AccountingManualUploadLibraryItem) {
    setDeletingUploadId(item.inboxItemStableId);
    setError(null);
    setMessage(null);
    setConfirmedProviderDocumentStableId(null);
    try {
      const result = await apiFetch<AccountingManualUploadPermanentDeleteResult>(
        `/accounting/inbox/manual-uploads/${item.inboxItemStableId}/permanent`,
        { method: 'DELETE' },
      );
      await handlePermanentDeleteResult(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeletingUploadId(null);
    }
  }

  async function runNow() {
    setRunning(true);
    setError(null);
    setMessage(null);
    setConfirmedProviderDocumentStableId(null);
    try {
      await apiFetch('/accounting/automation/run', { method: 'POST' });
      setMessage(
        isZh
          ? '已执行当前启用的采集任务；关闭的 Gmail 账单不会被拉取。'
          : 'Enabled intake jobs ran; Gmail is skipped while Gmail bills are disabled.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }

  async function handleExpenseConfirmed(item: AccountingInboxItem) {
    setReviewingInboxItemStableId(null);
    const loaded = await load();
    if (item.artifact.kind === 'IMAGE') {
      const retentionItem = loaded?.retentionQueue.find(
        (row) => row.artifactStableId === item.artifact.artifactStableId,
      );
      if (retentionItem) setOptimizingImage(retentionItem);
      setMessage(
        isZh
          ? '费用已确认入账，并已进入固定的图片优化队列；在你确认压缩版前原图不会删除。'
          : 'Expense confirmed and added to the persistent image-optimization queue; the original will not be deleted until you approve a compressed version.',
      );
    } else {
      setMessage(isZh ? '费用已确认入账。' : 'Expense confirmed.');
    }
  }

  async function handleImageOptimizationClosed() {
    setOptimizingImage(null);
    setMessage(
      isZh
        ? '图片优化尚未完成，可随时从固定的“图片优化”入口继续。'
        : 'Image optimization is not finished; you can resume it anytime from the persistent Image optimization queue.',
    );
    await load();
  }

  async function handleImageOptimizationAccepted(
    result: AccountingImageRetentionAccepted,
  ) {
    setOptimizingImage(null);
    setMessage(
      isZh
        ? `压缩版已确认并删除原图，节省 ${result.retained.savingsPercent.toFixed(2)}% 存储空间。`
        : `Compressed evidence accepted and the original was deleted, saving ${result.retained.savingsPercent.toFixed(2)}% storage.`,
    );
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isZh ? '财务收件箱' : 'Accounting Inbox'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {isZh
              ? 'Gmail 正文和附件进入审计证据链；手动上传在确认前属于可管理的临时资料，可放弃处理或永久删除。系统只给出资料类型/平台建议，只有人工确认后才成为受保护的财务证据。已确认的图片费用可在单独预览后选择压缩长期保存。'
              : 'Gmail bodies and attachments enter the audit evidence chain. Manual uploads remain operator-managed temporary evidence until confirmation, so they can be abandoned or permanently deleted. System recognition is only a document-type/provider suggestion; confirmed evidence becomes protected, and confirmed expense images can then be reviewed separately for compressed long-term retention.'}
          </p>
        </div>
        <button
          onClick={() => void runNow()}
          disabled={running}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
        >
          {running
            ? isZh
              ? '执行中…'
              : 'Running…'
            : isZh
              ? '运行已启用的采集'
              : 'Run enabled intake'}
        </button>
      </div>

      {error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <div className="flex flex-wrap items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <span>{message}</span>
          {confirmedProviderDocumentStableId ? (
            <a
              href={
                '/' +
                locale +
                '/accounting/settlements#provider-' +
                confirmedProviderDocumentStableId
              }
              className="rounded border border-emerald-300 bg-white px-2 py-1 font-medium text-emerald-800"
            >
              {isZh ? '继续复核识别结果' : 'Continue to review extraction'}
            </a>
          ) : null}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">
            {isZh ? '手动添加凭证' : 'Add evidence manually'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? '支持 PDF、CSV、XLSX、JPEG、PNG、WebP，文件会进入与 Gmail 相同的收件箱流程。'
              : 'PDF, CSV, XLSX, JPEG, PNG, and WebP use the same Inbox pipeline as Gmail.'}
          </p>
          <label className="mt-3 inline-flex cursor-pointer rounded border px-3 py-2 text-sm">
            <input
              type="file"
              accept=".pdf,.csv,.xlsx,image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadEvidence(file);
                event.currentTarget.value = '';
              }}
            />
            {uploading
              ? isZh
                ? '上传中…'
                : 'Uploading…'
              : isZh
                ? '选择文件'
                : 'Choose file'}
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">
            {isZh ? 'Gmail 发件人策略' : 'Gmail sender policies'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? '可信发件人会正常解析；未识别发件人进入隔离区；忽略发件人的后续邮件不会进入财务收件箱，之后恢复信任也不会自动补拉忽略期间的旧邮件。发件人策略不决定凭证类型，也不会自动入账。'
              : 'Trusted senders are parsed normally, unrecognized senders enter quarantine, and ignored senders do not enter Accounting Inbox. Restoring trust later does not backfill mail skipped while ignored. Sender policy does not classify or post evidence.'}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
            <input
              className="rounded border px-3 py-2 text-sm"
              type="email"
              placeholder="name@example.com"
              value={senderEmail}
              onChange={(event) => setSenderEmail(event.target.value)}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder={isZh ? '备注（可选）' : 'Label (optional)'}
              value={senderLabel}
              onChange={(event) => setSenderLabel(event.target.value)}
            />
            <select
              className="rounded border px-3 py-2 text-sm"
              value={senderDecision}
              onChange={(event) =>
                setSenderDecision(
                  event.target.value as AccountingSenderPolicyDecision,
                )
              }
            >
              <option value="TRUSTED">{isZh ? '信任' : 'Trusted'}</option>
              <option value="UNRECOGNIZED">
                {isZh ? '未识别' : 'Unrecognized'}
              </option>
              <option value="IGNORED">{isZh ? '忽略' : 'Ignored'}</option>
            </select>
            <button
              disabled={busySender || !senderEmail.trim()}
              onClick={() => void saveSenderPolicy()}
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {isZh ? '保存' : 'Save'}
            </button>
          </div>
          {senderPolicies.length ? (
            <div className="mt-3 space-y-2">
              {senderPolicies.map((sender) => (
                <div
                  key={sender.senderPolicyStableId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{sender.email}</span>
                    {sender.label ? (
                      <span className="ml-2 text-slate-500">{sender.label}</span>
                    ) : null}
                  </div>
                  <select
                    disabled={busySender}
                    className="rounded border px-2 py-1 text-sm"
                    value={sender.decision}
                    onChange={(event) =>
                      void saveSenderPolicy(
                        sender.email,
                        sender.label ?? '',
                        event.target.value as AccountingSenderPolicyDecision,
                      )
                    }
                  >
                    <option value="TRUSTED">{isZh ? '信任' : 'Trusted'}</option>
                    <option value="UNRECOGNIZED">
                      {isZh ? '未识别' : 'Unrecognized'}
                    </option>
                    <option value="IGNORED">{isZh ? '忽略' : 'Ignored'}</option>
                  </select>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <AccountingInboxItemsList
        items={items}
        loading={loading}
        isZh={isZh}
        busySender={busySender}
        classifyingId={classifyingId}
        discardingId={discardingId}
        confirmingProviderId={confirmingProviderId}
        confirmingOtherId={confirmingOtherId}
        onTrustSender={(email) =>
          saveSenderPolicy(email, existingSenderPolicyLabel(email), 'TRUSTED')
        }
        onIgnoreSender={(email) =>
          saveSenderPolicy(email, existingSenderPolicyLabel(email), 'IGNORED')
        }
        onClassificationChange={updateClassification}
        onReviewExpense={(item) =>
          setReviewingInboxItemStableId(item.inboxItemStableId)
        }
        onReviewBankCsv={(item) =>
          setReviewingBankCsvInboxItemStableId(item.inboxItemStableId)
        }
        onConfirmProviderFinancial={confirmProviderFinancial}
        onConfirmOther={confirmOther}
        onDiscard={discard}
        permanentDeleteCapabilities={permanentDeleteCapabilities}
        onEvidenceDeleted={handlePermanentDeleteResult}
      />

      {reviewing ? (
        <AccountingInboxExpenseReviewPanel
          item={reviewing}
          categories={categories}
          accounts={accounts}
          isZh={isZh}
          onClose={() => setReviewingInboxItemStableId(null)}
          onConfirmed={handleExpenseConfirmed}
          canPermanentDelete={
            permanentDeleteCapabilities.get(reviewing.inboxItemStableId) ?? false
          }
          onEvidenceDeleted={handlePermanentDeleteResult}
        />
      ) : null}

      {reviewingBankCsv ? (
        <AccountingInboxBankCsvReviewPanel
          item={reviewingBankCsv}
          accounts={accounts}
          knownStoreStableIds={knownStoreStableIds}
          isZh={isZh}
          onClose={() => setReviewingBankCsvInboxItemStableId(null)}
        />
      ) : null}

      <AccountingImageRetentionQueue
        items={imageRetentionQueue}
        isZh={isZh}
        onOpen={setOptimizingImage}
      />

      {optimizingImage ? (
        <AccountingImageRetentionPanel
          item={optimizingImage}
          isZh={isZh}
          onClosed={handleImageOptimizationClosed}
          onAccepted={handleImageOptimizationAccepted}
        />
      ) : null}

      <AccountingManualUploadLibrary
        items={manualUploads}
        loading={loading}
        isZh={isZh}
        discardingId={discardingId}
        deletingId={deletingUploadId}
        onDiscard={discard}
        onPermanentDelete={permanentlyDeleteUpload}
        onEvidenceDeleted={handlePermanentDeleteResult}
      />
    </div>
  );
}
