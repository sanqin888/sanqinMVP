'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import {
  AccountingEvidenceFileManager,
} from './accounting-evidence-file-manager';
import type {
  AccountingInboxItem,
  AccountingManualUploadPermanentDeleteResult,
} from './contracts/inbox';

export type AccountingEvidenceSource = {
  artifactStableId: string;
  filename: string | null;
  kind: AccountingInboxItem['artifact']['kind'];
  deletion?: {
    inboxItemStableId: string;
    canPermanentDelete: boolean;
  } | null;
};

type Props = {
  evidence: AccountingEvidenceSource;
  isZh: boolean;
  label?: string;
  className?: string;
  onDeleted?: (
    result: AccountingManualUploadPermanentDeleteResult,
  ) => void | Promise<void>;
};

export function AccountingEvidenceViewer({
  evidence,
  isZh,
  label,
  className,
  onDeleted,
}: Props) {
  const [open, setOpen] = useState(false);
  const [managingFiles, setManagingFiles] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const contentUrl = accountingEvidenceContentUrl(evidence.artifactStableId);
  const downloadUrl = accountingEvidenceDownloadUrl(evidence.artifactStableId);
  const browserPreview =
    evidence.kind === 'PDF' || evidence.kind === 'IMAGE';
  const title =
    evidence.filename ??
    (isZh ? 'Accounting 原始证据' : 'Accounting source evidence');
  const canPermanentDelete =
    accountingEvidenceCanPermanentDelete(evidence);

  async function permanentlyDeleteEvidence() {
    if (!canPermanentDelete || !evidence.deletion) return;
    const confirmed = window.confirm(
      isZh
        ? '永久删除会删除该未确认文件及其相关未确认数据库记录，无法恢复。确认继续？'
        : 'Permanent deletion removes this unconfirmed file and its related unconfirmed database records. This cannot be undone. Continue?',
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      const result =
        await apiFetch<AccountingManualUploadPermanentDeleteResult>(
          accountingEvidencePermanentDeleteUrl(
            evidence.deletion.inboxItemStableId,
          ),
          { method: 'DELETE' },
        );
      setDeleting(false);
      setOpen(false);
      await onDeleted?.(result);
    } catch (cause) {
      setDeleting(false);
      setDeleteError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDeleteError(null);
          setOpen(true);
        }}
        className={
          className ??
          'font-medium text-blue-700 hover:underline'
        }
      >
        {label ?? (isZh ? '查看证据' : 'View source evidence')}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="accounting-evidence-viewer-title"
            className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:min-h-[calc(100vh-3rem)]"
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2
                  id="accounting-evidence-viewer-title"
                  className="truncate font-semibold text-slate-900"
                >
                  {title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {evidence.kind}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManagingFiles(true)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {isZh ? '文件管理' : 'Manage files'}
                </button>
                {browserPreview ? (
                  <a
                    href={contentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {isZh ? '新窗口打开' : 'Open in new tab'}
                  </a>
                ) : null}
                <a
                  href={downloadUrl}
                  className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
                >
                  {isZh ? '下载文件' : 'Download'}
                </a>
                <button
                  type="button"
                  disabled={!canPermanentDelete || deleting}
                  onClick={() => void permanentlyDeleteEvidence()}
                  title={
                    canPermanentDelete
                      ? undefined
                      : isZh
                        ? '该证据已受保护，不可永久删除'
                        : 'This evidence is protected and cannot be permanently deleted'
                  }
                  className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {deleting
                    ? isZh
                      ? '删除中…'
                      : 'Deleting…'
                    : isZh
                      ? '永久删除'
                      : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {isZh ? '关闭' : 'Close'}
                </button>
              </div>
            </header>

            {deleteError ? (
              <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {deleteError}
              </p>
            ) : null}

            <div className="flex min-h-[65vh] flex-1 bg-slate-100 p-2 sm:p-4">
              {browserPreview ? (
                <iframe
                  src={contentUrl}
                  title={title}
                  className="min-h-[65vh] w-full flex-1 rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <div className="m-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                  <p className="font-medium text-slate-900">
                    {isZh
                      ? '该格式暂不支持浏览器内直接预览'
                      : 'This format does not yet have an in-browser preview'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {isZh
                      ? 'CSV / XLSX 的安全表格预览将在下一批加入。当前不会自动下载；如需原文件，请点击右上角“下载文件”。'
                      : 'A safe table preview for CSV / XLSX is planned for the next slice. Nothing downloads automatically; use Download only when you need the source file.'}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {managingFiles ? (
        <AccountingEvidenceFileManager
          isZh={isZh}
          onClose={() => setManagingFiles(false)}
        />
      ) : null}
    </>
  );
}

export function accountingEvidenceCanPermanentDelete(
  evidence: AccountingEvidenceSource,
): boolean {
  return (
    evidence.deletion?.canPermanentDelete === true &&
    Boolean(evidence.deletion.inboxItemStableId)
  );
}

export function accountingEvidencePermanentDeleteUrl(
  inboxItemStableId: string,
): string {
  return `/accounting/inbox/manual-uploads/${encodeURIComponent(inboxItemStableId)}/permanent`;
}

export function accountingEvidenceContentUrl(artifactStableId: string): string {
  return `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(artifactStableId)}/content`;
}

export function accountingEvidenceDownloadUrl(artifactStableId: string): string {
  return `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(artifactStableId)}/download`;
}
