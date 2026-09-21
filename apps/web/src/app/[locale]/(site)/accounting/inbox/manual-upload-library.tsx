'use client';

import { AccountingEvidenceViewer } from '../accounting-evidence-viewer';
import type {
  AccountingManualUploadLibraryItem,
  AccountingManualUploadPermanentDeleteResult,
} from '../contracts/inbox';

type Props = {
  items: AccountingManualUploadLibraryItem[];
  loading: boolean;
  isZh: boolean;
  discardingId: string | null;
  deletingId: string | null;
  onDiscard: (item: AccountingManualUploadLibraryItem) => Promise<void>;
  onPermanentDelete: (item: AccountingManualUploadLibraryItem) => Promise<void>;
  onEvidenceDeleted: (
    result: AccountingManualUploadPermanentDeleteResult,
  ) => Promise<void>;
};

export function AccountingManualUploadLibrary({
  items,
  loading,
  isZh,
  discardingId,
  deletingId,
  onDiscard,
  onPermanentDelete,
  onEvidenceDeleted,
}: Props) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">
              {isZh ? `上传文件库 ${items.length}` : `Upload library ${items.length}`}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isZh
                ? '管理手动上传的原始文件。未确认资料可放弃处理或永久删除；已确认财务证据只能查看。'
                : 'Manage manually uploaded source files. Unconfirmed evidence can be abandoned or permanently deleted; confirmed financial evidence is view-only.'}
            </p>
          </div>
          <span className="text-sm text-blue-700">
            {isZh ? '展开管理' : 'Open manager'}
          </span>
        </div>
      </summary>

      <div className="border-t border-slate-200 px-5 pb-5">
        {loading ? (
          <p className="py-4 text-sm text-slate-500">
            {isZh ? '加载中…' : 'Loading…'}
          </p>
        ) : null}
        {!loading && !items.length ? (
          <p className="py-4 text-sm text-slate-500">
            {isZh ? '当前没有手动上传文件。' : 'No manual uploads yet.'}
          </p>
        ) : null}

        <div className="divide-y">
          {items.map((item) => {
            const discarding = discardingId === item.inboxItemStableId;
            const deleting = deletingId === item.inboxItemStableId;
            return (
              <div
                key={item.inboxItemStableId}
                className="grid gap-3 py-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">
                      {item.originalFilename ?? item.artifactStableId}
                    </p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {statusLabel(item.status, isZh)}
                    </span>
                    {item.canPermanentDelete ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                        {isZh
                          ? '未确认 · 可永久删除'
                          : 'Unconfirmed · permanent delete available'}
                      </span>
                    ) : item.status === 'CONFIRMED' ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        {isZh ? '已确认 · 受保护' : 'Confirmed · protected'}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {item.kind}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString()} ·{' '}
                    {formatBytes(item.byteSize, isZh)}
                  </p>
                  {item.duplicateOf ? (
                    <p className="mt-1 text-xs text-amber-700">
                      {isZh ? '重复于' : 'Duplicate of'}:{' '}
                      {item.duplicateOf.originalFilename ??
                        item.duplicateOf.artifactStableId}
                      {item.duplicateOf.status
                        ? ` · ${statusLabel(item.duplicateOf.status, isZh)}`
                        : ''}
                    </p>
                  ) : null}
                </div>

                <div className="text-sm text-slate-600">
                  <p>
                    {isZh ? '资料类型' : 'Classification'}:{' '}
                    {classificationLabel(item.classification, isZh)}
                  </p>
                  {item.retentionState ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {isZh ? '图片留存' : 'Image retention'}: {item.retentionState}
                    </p>
                  ) : null}
                  {item.contentUrl ? (
                    <AccountingEvidenceViewer
                      evidence={{
                        artifactStableId: item.artifactStableId,
                        filename: item.originalFilename,
                        kind: item.kind,
                        deletion: {
                          inboxItemStableId: item.inboxItemStableId,
                          canPermanentDelete: item.canPermanentDelete,
                        },
                      }}
                      isZh={isZh}
                      onDeleted={onEvidenceDeleted}
                      label={isZh ? '查看文件' : 'Open file'}
                      className="mt-1 inline-block text-blue-600 hover:underline"
                    />
                  ) : item.status === 'DUPLICATE' ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {isZh
                        ? '重复上传不会保留第二份物理文件。'
                        : 'Duplicate uploads do not retain a second binary copy.'}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {item.canDiscard ? (
                    <button
                      disabled={discarding || deleting}
                      onClick={() => void onDiscard(item)}
                      className="rounded border px-3 py-1.5 text-sm text-amber-700 disabled:opacity-50"
                    >
                      {discarding
                        ? isZh
                          ? '处理中…'
                          : 'Working…'
                        : isZh
                          ? '放弃处理'
                          : 'Abandon'}
                    </button>
                  ) : null}

                  {item.canPermanentDelete ? (
                    <button
                      disabled={discarding || deleting}
                      onClick={() => {
                        const confirmed = window.confirm(
                          isZh
                            ? '永久删除会删除该未确认文件及其相关未确认数据库记录，无法恢复。确认继续？'
                            : 'Permanent deletion removes this unconfirmed file and its related unconfirmed database records. This cannot be undone. Continue?',
                        );
                        if (confirmed) void onPermanentDelete(item);
                      }}
                      className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
                    >
                      {deleting
                        ? isZh
                          ? '删除中…'
                          : 'Deleting…'
                        : isZh
                          ? '永久删除'
                          : 'Delete permanently'}
                    </button>
                  ) : (
                    <span className="self-center text-xs text-slate-500">
                      {item.status === 'CONFIRMED'
                        ? isZh
                          ? '已确认资料不可删除'
                          : 'Confirmed evidence is protected'
                        : isZh
                          ? '当前证据链受保护，不可永久删除'
                          : 'Protected evidence; permanent deletion unavailable'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function statusLabel(status: AccountingManualUploadLibraryItem['status'], isZh: boolean) {
  if (!isZh) return status;
  switch (status) {
    case 'PENDING_REVIEW':
      return '待处理';
    case 'QUARANTINED':
      return '已隔离';
    case 'DUPLICATE':
      return '重复文件';
    case 'CONFIRMED':
      return '已确认';
    case 'ERROR':
      return '处理异常';
    case 'DISCARDED':
      return '已放弃';
  }
}

function classificationLabel(
  classification: AccountingManualUploadLibraryItem['classification'],
  isZh: boolean,
) {
  if (!isZh) return classification;
  switch (classification) {
    case 'EXPENSE_DOCUMENT':
      return '费用单';
    case 'PROVIDER_FINANCIAL_DOCUMENT':
      return '结算单';
    case 'OTHER_DOCUMENT':
      return '其他';
    case 'UNKNOWN':
      return '未确定';
  }
}

function formatBytes(bytes: number | null, isZh: boolean) {
  if (bytes == null) return isZh ? '大小未知' : 'size unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
