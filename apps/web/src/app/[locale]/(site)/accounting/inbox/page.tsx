'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type {
  AccountingProviderFinancialConfirmationResult,
} from '../contracts/provider-financial';
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
  AccountingImageRetentionAccepted,
  AccountingImageRetentionQueueItem,
  AccountingInboxClassification,
  AccountingInboxItem,
  AccountingManualUploadLibraryItem,
  AccountingManualUploadPermanentDeleteResult,
  AccountingManualUploadResult,
  AccountingTrustedSender,
} from '../contracts/inbox';

export default function AccountingInboxPage() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const isZh = locale === 'zh';
  const [items, setItems] = useState<AccountingInboxItem[]>([]);
  const [manualUploads, setManualUploads] = useState<
    AccountingManualUploadLibraryItem[]
  >([]);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [trustedSenders, setTrustedSenders] = useState<AccountingTrustedSender[]>([]);
  const [imageRetentionQueue, setImageRetentionQueue] = useState<
    AccountingImageRetentionQueueItem[]
  >([]);
  const [reviewingInboxItemStableId, setReviewingInboxItemStableId] = useState<
    string | null
  >(null);
  const reviewing = findAccountingInboxItemByStableId(
    items,
    reviewingInboxItemStableId,
  );
  const [optimizingImage, setOptimizingImage] =
    useState<AccountingImageRetentionQueueItem | null>(null);
  const [senderEmail, setSenderEmail] = useState('');
  const [senderLabel, setSenderLabel] = useState('');
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
          apiFetch<AccountingTrustedSender[]>('/accounting/inbox/trusted-senders'),
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
      setTrustedSenders(senders);
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
      if (result.inboxItem?.status === 'DUPLICATE') {
        setMessage(
          result.duplicateStorageCleanupComplete === false
            ? isZh
              ? '检测到重复文件，未加入待处理队列；但本次冗余物理文件清理失败，服务器日志已记录待清理路径。重复记录仍可在“上传文件库”中永久删除。'
              : 'Duplicate file detected and excluded from the review queue, but redundant binary cleanup failed. The server log records the cleanup path; the duplicate record can still be permanently deleted from Upload library.'
            : isZh
              ? '检测到重复文件，未加入待处理队列；本次重复上传不会保留第二份物理文件，可在“上传文件库”中查看或永久删除重复记录。'
              : 'Duplicate file detected. It was not added to the review queue, and no second binary copy is retained. You can review or permanently delete the duplicate record in Upload library.',
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

  async function saveTrustedSender(
    email = senderEmail,
    label = senderLabel,
    isActive = true,
  ) {
    if (!email.trim()) return;
    setBusySender(true);
    setError(null);
    setMessage(null);
    setConfirmedProviderDocumentStableId(null);
    try {
      await apiFetch('/accounting/inbox/trusted-senders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          label: label.trim() || null,
          isActive,
        }),
      });
      setSenderEmail('');
      setSenderLabel('');
      setMessage(
        isZh
          ? '可信发件人已保存。已隔离的旧邮件会在下次 Gmail 拉取时重新按可信规则处理。'
          : 'Trusted sender saved. Existing quarantined mail will be reconsidered on the next Gmail intake run.',
      );
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
      setConfirmedProviderDocumentStableId(result.documentStableId);
      setMessage(
        isZh
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
      if (reviewingInboxItemStableId === item.inboxItemStableId) {
        setReviewingInboxItemStableId(null);
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
            {isZh ? '可信 Gmail 发件人' : 'Trusted Gmail senders'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? '未知发件人的邮件只会隔离，不会自动解析。发件人仅决定 intake 信任，不决定凭证属于哪家平台，也不会自动入账。'
              : 'Unknown senders are quarantined and not parsed automatically. Sender trust controls intake only; it does not classify or post evidence.'}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
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
            <button
              disabled={busySender || !senderEmail.trim()}
              onClick={() => void saveTrustedSender()}
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {isZh ? '保存' : 'Save'}
            </button>
          </div>
          {trustedSenders.length ? (
            <div className="mt-3 space-y-2">
              {trustedSenders.map((sender) => (
                <div
                  key={sender.trustedSenderStableId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{sender.email}</span>
                    {sender.label ? (
                      <span className="ml-2 text-slate-500">{sender.label}</span>
                    ) : null}
                  </div>
                  <button
                    disabled={busySender}
                    className={
                      sender.isActive ? 'text-red-600' : 'text-emerald-600'
                    }
                    onClick={() =>
                      void saveTrustedSender(
                        sender.email,
                        sender.label ?? '',
                        !sender.isActive,
                      )
                    }
                  >
                    {sender.isActive
                      ? isZh
                        ? '停用'
                        : 'Disable'
                      : isZh
                        ? '启用'
                        : 'Enable'}
                  </button>
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
        onTrustSender={(email) => saveTrustedSender(email)}
        onClassificationChange={updateClassification}
        onReviewExpense={(item) =>
          setReviewingInboxItemStableId(item.inboxItemStableId)
        }
        onConfirmProviderFinancial={confirmProviderFinancial}
        onConfirmOther={confirmOther}
        onDiscard={discard}
      />

      {reviewing ? (
        <AccountingInboxExpenseReviewPanel
          item={reviewing}
          categories={categories}
          accounts={accounts}
          isZh={isZh}
          onClose={() => setReviewingInboxItemStableId(null)}
          onConfirmed={handleExpenseConfirmed}
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
      />
    </div>
  );
}
