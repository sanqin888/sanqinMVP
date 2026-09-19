'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type {
  AccountingImageRetentionAccepted,
  AccountingImageRetentionCandidatePreview,
  AccountingImageRetentionDerivativePreview,
  AccountingImageRetentionProfile,
  AccountingImageRetentionQueueItem,
} from '../contracts/inbox';

type Props = {
  item: AccountingImageRetentionQueueItem;
  isZh: boolean;
  onClosed: () => Promise<void>;
  onAccepted: (result: AccountingImageRetentionAccepted) => Promise<void>;
};

type ReviewPreview = {
  original: {
    url: string;
    byteSize: number;
    width: number;
    height: number;
  };
  derivative: AccountingImageRetentionDerivativePreview;
};

const profiles: AccountingImageRetentionProfile[] = [
  'SPACE_SAVER',
  'BALANCED',
  'HIGH_QUALITY',
  'NEAR_ORIGINAL',
];

export function AccountingImageRetentionPanel({
  item,
  isZh,
  onClosed,
  onAccepted,
}: Props) {
  const initializedRef = useRef(false);
  const [retentionState, setRetentionState] = useState(item.retentionState);
  const [profile, setProfile] = useState<AccountingImageRetentionProfile>(
    item.derivative?.profile ?? 'BALANCED',
  );
  const [preview, setPreview] = useState<ReviewPreview | null>(() =>
    reviewPreviewFromQueue(item),
  );
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(
    async (nextProfile: AccountingImageRetentionProfile) => {
      if (retentionState === 'PURGE_PENDING') return;
      setBusy(true);
      setError(null);
      try {
        const result = await apiFetch<AccountingImageRetentionCandidatePreview>(
          `/accounting/inbox/${item.inboxItemStableId}/image-retention/candidate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: nextProfile }),
          },
        );
        setRetentionState('CANDIDATE_READY');
        setProfile(nextProfile);
        setPreview({
          original: result.original,
          derivative: result.candidate,
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [item.inboxItemStableId, retentionState],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (item.retentionState === 'ORIGINAL_PRESENT') {
      void regenerate('BALANCED');
    }
  }, [item.retentionState, regenerate]);

  async function keepOriginal() {
    if (retentionState === 'PURGE_PENDING') return;
    setBusy(true);
    setError(null);
    try {
      if (retentionState === 'CANDIDATE_READY') {
        await apiFetch(
          `/accounting/inbox/${item.inboxItemStableId}/image-retention/candidate`,
          { method: 'DELETE' },
        );
      }
      await onClosed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function acceptCurrent() {
    if (retentionState === 'ORIGINAL_PRESENT') return;
    setAccepting(true);
    setError(null);
    try {
      const result = await apiFetch<AccountingImageRetentionAccepted>(
        `/accounting/inbox/${item.inboxItemStableId}/image-retention/accept`,
        { method: 'POST' },
      );
      await onAccepted(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAccepting(false);
    }
  }

  const pendingDerivative =
    retentionState === 'PURGE_PENDING' ? item.derivative : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="accounting-image-retention-title"
        className="mx-auto my-6 max-w-6xl rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-2xl"
      >
        <div>
          <h2
            id="accounting-image-retention-title"
            className="text-lg font-semibold"
          >
            {isZh ? '图片存储优化' : 'Image storage optimization'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {item.originalFilename ? `${item.originalFilename} · ` : ''}
            {retentionState === 'PURGE_PENDING'
              ? isZh
                ? '压缩版已经确认；当前只需安全续完原图删除和状态收口。'
                : 'The compressed version was already approved; only the recoverable original purge/finalization remains.'
              : isZh
                ? '费用已经入账。原图仍然保留；只有你确认当前压缩版清晰后，系统才会删除原始图片。'
                : 'The expense is already posted. The original remains untouched until you approve the current compressed version.'}
          </p>
        </div>

        {retentionState !== 'PURGE_PENDING' ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {profiles.map((option) => (
              <button
                key={option}
                type="button"
                disabled={busy || accepting}
                onClick={() => void regenerate(option)}
                className={`rounded border px-3 py-2 text-sm disabled:opacity-50 ${
                  profile === option
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {profileLabel(option, isZh)}
              </button>
            ))}
          </div>
        ) : null}

        {busy && !preview ? (
          <p className="mt-4 text-sm text-slate-500">
            {isZh ? '正在生成压缩预览…' : 'Generating compressed preview…'}
          </p>
        ) : null}

        {preview ? (
          <>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ImagePreview
                title={isZh ? '原图' : 'Original'}
                url={preview.original.url}
                width={preview.original.width}
                height={preview.original.height}
                byteSize={preview.original.byteSize}
              />
              <ImagePreview
                title={isZh ? '当前压缩版' : 'Current compressed version'}
                url={preview.derivative.url}
                width={preview.derivative.width}
                height={preview.derivative.height}
                byteSize={preview.derivative.byteSize}
                detail={
                  isZh
                    ? `节省 ${preview.derivative.savingsPercent.toFixed(2)}% · WebP quality ${preview.derivative.quality}`
                    : `${preview.derivative.savingsPercent.toFixed(2)}% saved · WebP quality ${preview.derivative.quality}`
                }
              />
            </div>
            <p className="mt-3 rounded bg-white px-3 py-2 text-xs text-blue-800">
              {isZh
                ? '请放大检查日期、金额、商户名称和细小文字。如果不够清楚，选择“高清”或“接近原图”重新生成；每次只替换尚未确认的临时候选图。'
                : 'Zoom in and check dates, amounts, merchant names, and small print. If needed, regenerate with High quality or Near original; only the unaccepted candidate is replaced.'}
            </p>
          </>
        ) : pendingDerivative ? (
          <div className="mt-4 max-w-xl">
            <ImagePreview
              title={isZh ? '已接受压缩版' : 'Accepted compressed version'}
              url={pendingDerivative.url}
              width={pendingDerivative.width}
              height={pendingDerivative.height}
              byteSize={pendingDerivative.byteSize}
              detail={
                isZh
                  ? `节省 ${pendingDerivative.savingsPercent.toFixed(2)}% · 等待完成原图删除`
                  : `${pendingDerivative.savingsPercent.toFixed(2)}% saved · waiting to finish original purge`
              }
            />
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {retentionState !== 'PURGE_PENDING' ? (
            <button
              type="button"
              disabled={busy || accepting}
              onClick={() => void keepOriginal()}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {isZh ? '保留原图并关闭' : 'Keep original and close'}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || accepting}
              onClick={() => void onClosed()}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {isZh ? '稍后继续' : 'Continue later'}
            </button>
          )}
          <button
            type="button"
            disabled={
              retentionState === 'ORIGINAL_PRESENT' ||
              (retentionState === 'CANDIDATE_READY' && !preview) ||
              busy ||
              accepting
            }
            onClick={() => void acceptCurrent()}
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {accepting
              ? isZh
                ? '处理中…'
                : 'Applying…'
              : retentionState === 'PURGE_PENDING'
                ? isZh
                  ? '继续完成原图删除'
                  : 'Resume original purge'
                : isZh
                  ? '确认当前版本并删除原图'
                  : 'Accept current version and delete original'}
          </button>
        </div>
      </section>
    </div>
  );
}

function reviewPreviewFromQueue(
  item: AccountingImageRetentionQueueItem,
): ReviewPreview | null {
  if (
    item.retentionState !== 'CANDIDATE_READY' ||
    !item.derivative ||
    !item.original.byteSize ||
    !item.original.width ||
    !item.original.height
  ) {
    return null;
  }
  return {
    original: {
      url: item.original.url,
      byteSize: item.original.byteSize,
      width: item.original.width,
      height: item.original.height,
    },
    derivative: item.derivative,
  };
}

function ImagePreview({
  title,
  url,
  width,
  height,
  byteSize,
  detail,
}: {
  title: string;
  url: string;
  width: number;
  height: number;
  byteSize: number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <strong>{title}</strong>
        <span className="text-slate-500">
          {width} × {height} · {formatBytes(byteSize)}
        </span>
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <Image
          unoptimized
          src={url}
          alt={title}
          width={width}
          height={height}
          className="max-h-96 w-full rounded object-contain"
        />
      </a>
      {detail ? <p className="mt-2 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function profileLabel(
  profile: AccountingImageRetentionProfile,
  isZh: boolean,
): string {
  switch (profile) {
    case 'SPACE_SAVER':
      return isZh ? '省空间' : 'Space saver';
    case 'BALANCED':
      return isZh ? '平衡' : 'Balanced';
    case 'HIGH_QUALITY':
      return isZh ? '高清' : 'High quality';
    case 'NEAR_ORIGINAL':
      return isZh ? '接近原图' : 'Near original';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
