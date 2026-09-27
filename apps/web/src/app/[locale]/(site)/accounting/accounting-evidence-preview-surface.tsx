'use client';

import { useState } from 'react';
import {
  AccountingEvidenceTablePreview,
  accountingEvidenceSupportsTabularPreview,
} from './accounting-evidence-table-preview';
import type { AccountingInboxItem } from './contracts/inbox';

export type AccountingEvidencePreviewSource = {
  artifactStableId: string;
  filename: string | null;
  kind: AccountingInboxItem['artifact']['kind'];
};

export function AccountingEvidencePreviewSurface({
  evidence,
  isZh,
}: {
  evidence: AccountingEvidencePreviewSource;
  isZh: boolean;
}) {
  const contentUrl = accountingEvidenceContentUrl(evidence.artifactStableId);
  const browserPreviewMode = accountingEvidenceBrowserPreviewMode(evidence.kind);
  const tabularPreview = accountingEvidenceSupportsTabularPreview({
    kind: evidence.kind,
    filename: evidence.filename,
  });
  const title =
    evidence.filename ??
    (isZh ? 'Accounting 原始证据' : 'Accounting source evidence');

  return (
    <div className="flex min-h-[65vh] flex-1 bg-slate-100 p-2 sm:p-4">
      {browserPreviewMode === 'IMAGE' ? (
        <ProtectedAccountingImage url={contentUrl} alt={title} isZh={isZh} />
      ) : browserPreviewMode === 'PDF' ? (
        <iframe
          src={contentUrl}
          title={title}
          className="min-h-[65vh] w-full flex-1 rounded-lg border border-slate-200 bg-white"
        />
      ) : tabularPreview ? (
        <AccountingEvidenceTablePreview
          key={evidence.artifactStableId}
          artifactStableId={evidence.artifactStableId}
          filename={evidence.filename}
          isZh={isZh}
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
              ? '当前不会自动下载；如需原文件，请使用“下载文件”。'
              : 'Nothing downloads automatically; use Download only when you need the source file.'}
          </p>
        </div>
      )}
    </div>
  );
}

function ProtectedAccountingImage({
  url,
  alt,
  isZh,
}: {
  url: string;
  alt: string;
  isZh: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex min-h-[65vh] w-full flex-1 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
      {failed ? (
        <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
          <p className="font-medium">
            {isZh ? '图片预览加载失败' : 'Image preview failed to load'}
          </p>
          <p className="mt-1 break-words text-xs">
            {isZh
              ? '浏览器无法解码这份受保护图片。可以使用“下载文件”检查原始保留文件。'
              : 'The browser could not decode this protected image. Use Download file to inspect the retained binary.'}
          </p>
        </div>
      ) : (
        // The protected artifact route is same-origin, so the session cookie is
        // carried automatically. Keep this out of Next image optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          onError={() => setFailed(true)}
          className="max-h-[75vh] max-w-full object-contain"
        />
      )}
    </div>
  );
}

export function accountingEvidenceBrowserPreviewMode(
  kind: AccountingEvidencePreviewSource['kind'],
): 'PDF' | 'IMAGE' | null {
  if (kind === 'PDF') return 'PDF';
  if (kind === 'IMAGE') return 'IMAGE';
  return null;
}

export function accountingEvidenceContentUrl(artifactStableId: string): string {
  return `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(artifactStableId)}/content`;
}

export function accountingEvidenceDownloadUrl(artifactStableId: string): string {
  return `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(artifactStableId)}/download`;
}
