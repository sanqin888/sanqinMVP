'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { AccountingInboxExpenseReviewPanel } from './expense-review-panel';
import { AccountingInboxItemsList } from './inbox-items-list';
import {
  type AccountingAccount,
  type AccountingCategory,
  type AccountingInboxItem,
  type AccountingTrustedSender,
} from './inbox-model';

export default function AccountingInboxPage() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const isZh = locale === 'zh';
  const [items, setItems] = useState<AccountingInboxItem[]>([]);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [trustedSenders, setTrustedSenders] = useState<AccountingTrustedSender[]>([]);
  const [reviewing, setReviewing] = useState<AccountingInboxItem | null>(null);
  const [senderEmail, setSenderEmail] = useState('');
  const [senderLabel, setSenderLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [busySender, setBusySender] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inbox, cats, accts, senders] = await Promise.all([
        apiFetch<AccountingInboxItem[]>('/accounting/inbox?limit=100'),
        apiFetch<AccountingCategory[]>('/accounting/categories'),
        apiFetch<AccountingAccount[]>('/accounting/accounts'),
        apiFetch<AccountingTrustedSender[]>('/accounting/inbox/trusted-senders'),
      ]);
      setItems(inbox);
      setCategories(cats);
      setAccounts(accts);
      setTrustedSenders(senders);
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
    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiFetch('/accounting/inbox/artifacts', {
        method: 'POST',
        body: formData,
      });
      setMessage(
        isZh ? '文件已进入财务收件箱。' : 'Evidence added to Accounting Inbox.',
      );
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

  async function discard(item: AccountingInboxItem) {
    setDiscardingId(item.inboxItemStableId);
    setError(null);
    try {
      await apiFetch(`/accounting/inbox/${item.inboxItemStableId}`, {
        method: 'DELETE',
      });
      if (reviewing?.inboxItemStableId === item.inboxItemStableId) {
        setReviewing(null);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDiscardingId(null);
    }
  }

  async function runNow() {
    setRunning(true);
    setError(null);
    setMessage(null);
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

  async function handleExpenseConfirmed() {
    setReviewing(null);
    setMessage(isZh ? '费用已确认入账。' : 'Expense confirmed.');
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
              ? 'Gmail 正文、附件和手动上传文件都会先成为不可变的来源凭证；只有明确选择“按费用处理”后才会进入费用入账流程。平台财务资料可保留在这里等待专用解析。'
              : 'Gmail bodies, attachments, and manual uploads first become immutable source evidence. Nothing becomes an expense until you explicitly review it as one; provider financial evidence can remain here for provider-specific parsing.'}
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
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">
            {isZh ? '手动添加凭证' : 'Add evidence manually'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? '支持 PDF、CSV、JPEG、PNG、WebP，文件会进入与 Gmail 相同的收件箱流程。'
              : 'PDF, CSV, JPEG, PNG, and WebP use the same Inbox pipeline as Gmail.'}
          </p>
          <label className="mt-3 inline-flex cursor-pointer rounded border px-3 py-2 text-sm">
            <input
              type="file"
              accept=".pdf,.csv,image/jpeg,image/png,image/webp"
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

      {reviewing ? (
        <AccountingInboxExpenseReviewPanel
          item={reviewing}
          categories={categories}
          accounts={accounts}
          isZh={isZh}
          onClose={() => setReviewing(null)}
          onConfirmed={handleExpenseConfirmed}
        />
      ) : null}

      <AccountingInboxItemsList
        items={items}
        loading={loading}
        isZh={isZh}
        busySender={busySender}
        discardingId={discardingId}
        onTrustSender={(email) => saveTrustedSender(email)}
        onReviewExpense={setReviewing}
        onDiscard={discard}
      />
    </div>
  );
}
