'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { CloverFeeReclassificationPreview } from '../contracts/settlements';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function CloverFeeReclassificationPanel({
  documentStableId,
  isZh,
}: {
  documentStableId: string;
  isZh: boolean;
}) {
  const [preview, setPreview] =
    useState<CloverFeeReclassificationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ documentStableId });
      const data = await apiFetch<CloverFeeReclassificationPreview>(
        `/accounting/journal/provider-settlement/clover-fee-reclassification-preview?${query.toString()}`,
      );
      setPreview(data);
      setArmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [documentStableId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const missingFeePayable = preview?.blockReasons.includes(
    'CLOVER_FEE_PAYABLE_ACCOUNT_NOT_PROVISIONED',
  );

  async function provision() {
    setProvisioning(true);
    setError(null);
    try {
      await apiFetch('/accounting/setup/provider-fee-clearing', {
        method: 'POST',
      });
      await loadPreview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setProvisioning(false);
    }
  }

  async function execute() {
    if (!preview || preview.status !== 'READY') return;
    setExecuting(true);
    setError(null);
    try {
      const result = await apiFetch<CloverFeeReclassificationPreview>(
        '/accounting/journal/provider-settlement/clover-fee-reclassification',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentStableId,
            expectedPlanHash: preview.planHash,
          }),
        },
      );
      setPreview(result);
      setArmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setExecuting(false);
    }
  }

  if (loading && !preview) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        {isZh ? '正在检查 Clover 费用清算…' : 'Checking Clover fee clearing…'}
      </div>
    );
  }

  if (!preview && error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!preview || preview.status === 'NOOP') return null;

  if (preview.status === 'ALREADY_RECLASSIFIED') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <p className="font-semibold">
          {isZh
            ? 'Clover 费用已从销售 Pending 重分类'
            : 'Clover fees reclassified out of sales Pending'}
        </p>
        <p className="mt-1 break-all font-mono text-xs">
          {preview.existingCorrectionJournalEntryStableId ?? '—'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-amber-950">
            {isZh
              ? 'Clover 历史费用 Pending 修正'
              : 'Clover legacy fee Pending correction'}
          </p>
          <p className="mt-1 text-xs text-amber-900">
            {isZh
              ? '旧 Journal 把 Clover 费用贷记到了销售 Pending。修正只做 Dr Clover Pending / Cr Clover 费用应付，不重复记费用。'
              : 'The legacy Journal credited Clover sales Pending for fees. This correction only posts Dr Clover Pending / Cr Clover fee payable and does not duplicate expense recognition.'}
          </p>
          {preview.amountCents > 0 ? (
            <p className="mt-2 font-semibold text-amber-950">
              {isZh ? '待重分类金额' : 'Amount to reclassify'}:{' '}
              {money(preview.amountCents)}
            </p>
          ) : null}
        </div>
        <span
          className={
            preview.status === 'READY'
              ? 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800'
              : 'rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800'
          }
        >
          {preview.status}
        </span>
      </div>

      {preview.blockReasons.length ? (
        <div className="mt-3 rounded border border-amber-200 bg-white p-2 text-xs text-slate-700">
          {preview.blockReasons.join(' · ')}
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {missingFeePayable ? (
          <button
            type="button"
            onClick={() => void provision()}
            disabled={provisioning || executing}
            className="rounded border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"
          >
            {provisioning
              ? isZh
                ? '正在建立费用应付科目…'
                : 'Provisioning fee payable…'
              : isZh
                ? '建立 Clover 费用应付科目'
                : 'Provision Clover fee payable'}
          </button>
        ) : null}

        {preview.status === 'READY' && !armed ? (
          <button
            type="button"
            onClick={() => setArmed(true)}
            disabled={executing}
            className="rounded bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {isZh ? '准备重分类' : 'Prepare reclassification'}
          </button>
        ) : null}

        {preview.status === 'READY' && armed ? (
          <>
            <button
              type="button"
              onClick={() => void execute()}
              disabled={executing}
              className="rounded bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {executing
                ? isZh
                  ? '正在写入 Journal…'
                  : 'Writing Journal…'
                : isZh
                  ? '确认真实重分类'
                  : 'Confirm real reclassification'}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              disabled={executing}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-xs disabled:opacity-50"
            >
              {isZh ? '取消' : 'Cancel'}
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => void loadPreview()}
          disabled={loading || provisioning || executing}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-xs disabled:opacity-50"
        >
          {loading ? (isZh ? '刷新中…' : 'Refreshing…') : isZh ? '刷新' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
