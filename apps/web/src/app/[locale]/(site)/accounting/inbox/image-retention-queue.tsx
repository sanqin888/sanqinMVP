'use client';

import type { AccountingImageRetentionQueueItem } from './inbox-model';

type Props = {
  items: AccountingImageRetentionQueueItem[];
  isZh: boolean;
  onOpen: (item: AccountingImageRetentionQueueItem) => void;
};

export function AccountingImageRetentionQueue({ items, isZh, onOpen }: Props) {
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {isZh ? `图片优化 ${items.length}` : `Image optimization ${items.length}`}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isZh
              ? '这里长期保留已入账、但图片留存方案尚未完成的凭证。未压缩图片可以生成预览，已有候选可以继续调整，异常中断项可以恢复完成。'
              : 'This persistent queue keeps posted expense images whose retention decision is not finished. Generate previews for originals, resume existing candidates, or recover interrupted purges.'}
          </p>
        </div>
      </div>

      {!items.length ? (
        <p className="mt-4 text-sm text-slate-500">
          {isZh ? '当前没有待处理的图片优化。' : 'No image optimization needs attention.'}
        </p>
      ) : (
        <div className="mt-4 divide-y divide-blue-100 rounded-lg border border-blue-100 bg-white">
          {items.map((item) => (
            <div
              key={item.inboxItemStableId}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="max-w-xl truncate text-sm font-medium text-slate-800">
                    {item.originalFilename || item.artifactStableId}
                  </p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {stateLabel(item.retentionState, isZh)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.original.byteSize != null
                    ? `${isZh ? '原始大小' : 'Original'} ${formatBytes(item.original.byteSize)}`
                    : isZh
                      ? '原始大小未知'
                      : 'Original size unavailable'}
                  {item.derivative
                    ? ` · ${isZh ? '当前压缩版' : 'Current derivative'} ${formatBytes(item.derivative.byteSize)} · ${item.derivative.savingsPercent.toFixed(2)}%`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="rounded border border-blue-300 bg-white px-3 py-2 text-sm text-blue-700"
              >
                {item.retentionState === 'PURGE_PENDING'
                  ? isZh
                    ? '恢复处理'
                    : 'Resume'
                  : item.retentionState === 'CANDIDATE_READY'
                    ? isZh
                      ? '继续确认'
                      : 'Continue review'
                    : isZh
                      ? '优化图片'
                      : 'Optimize image'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function stateLabel(
  state: AccountingImageRetentionQueueItem['retentionState'],
  isZh: boolean,
) {
  switch (state) {
    case 'ORIGINAL_PRESENT':
      return isZh ? '未生成压缩版' : 'Original only';
    case 'CANDIDATE_READY':
      return isZh ? '压缩版待确认' : 'Candidate ready';
    case 'PURGE_PENDING':
      return isZh ? '删除恢复中' : 'Purge pending';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
