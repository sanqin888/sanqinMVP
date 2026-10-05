'use client';

import { useEffect, useMemo, useState } from 'react';

import { apiFetch, getApiErrorMessage } from '@/lib/api/client';
import type { AccountingInboxItem } from '../contracts/inbox';
import type {
  AccountingExternalSaleReconstructionExecution,
  AccountingExternalSaleReconstructionPreview,
} from '../contracts/external-sales';
import { money } from './external-sales-utils';

export function ExternalSaleReconstructionPanel({
  isZh,
  onExecuted,
}: {
  isZh: boolean;
  onExecuted: (externalSaleStableId: string) => void;
}) {
  const [evidence, setEvidence] = useState<AccountingInboxItem[]>([]);
  const [artifactStableId, setArtifactStableId] = useState('');
  const [classificationStableId, setClassificationStableId] = useState(
    'external_supermarket',
  );
  const [preview, setPreview] =
    useState<AccountingExternalSaleReconstructionPreview | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiFetch<AccountingInboxItem[]>(
      '/accounting/inbox?status=CONFIRMED&classification=OTHER_DOCUMENT&limit=200',
    )
      .then((rows) => {
        if (!active) return;
        const eligible = rows.filter((row) =>
          row.artifact.originalFilename?.toLowerCase().endsWith('.xlsx'),
        );
        setEvidence(eligible);
        setArtifactStableId(
          (current) =>
            current || eligible[0]?.artifact.artifactStableId || '',
        );
      })
      .catch((error) => {
        if (!active) return;
        setFeedback(
          getApiErrorMessage(
            error,
            isZh
              ? '加载历史证据失败。'
              : 'Failed to load historical evidence.',
          ),
        );
      })
      .finally(() => {
        if (active) setLoadingEvidence(false);
      });
    return () => {
      active = false;
    };
  }, [isZh]);

  const selected = useMemo(
    () =>
      evidence.find(
        (row) => row.artifact.artifactStableId === artifactStableId,
      ),
    [artifactStableId, evidence],
  );

  const runPreview = async () => {
    if (!artifactStableId) {
      setFeedback(isZh ? '请选择一份 XLSX 证据。' : 'Select XLSX evidence.');
      return;
    }
    setPreviewing(true);
    setFeedback(null);
    setPreview(null);
    try {
      const next = await apiFetch<AccountingExternalSaleReconstructionPreview>(
        '/accounting/external-sales/reconstruction/preview',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artifactStableId,
            classificationStableId: classificationStableId.trim() || null,
          }),
        },
      );
      setPreview(next);
    } catch (error) {
      setFeedback(
        getApiErrorMessage(
          error,
          isZh
            ? '历史重建预览失败。'
            : 'Historical reconstruction preview failed.',
        ),
      );
    } finally {
      setPreviewing(false);
    }
  };

  const execute = async () => {
    if (!preview || preview.status !== 'READY') return;
    const confirmed = window.confirm(
      isZh
        ? '确认按当前预览写入 canonical External Sale？写入后不能原地编辑，只能通过冲销/订正。'
        : 'Post this preview as a canonical External Sale? Posted facts cannot be edited in place and require reversal/correction.',
    );
    if (!confirmed) return;

    setExecuting(true);
    setFeedback(null);
    try {
      const result =
        await apiFetch<AccountingExternalSaleReconstructionExecution>(
          '/accounting/external-sales/reconstruction/execute',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artifactStableId: preview.evidence.artifactStableId,
              classificationStableId:
                preview.proposedSale.classificationStableId,
              expectedPlanHash: preview.planHash,
            }),
          },
        );
      setFeedback(
        isZh
          ? '历史 External Sale 已通过 canonical authority 写入。'
          : 'Historical External Sale was posted through canonical authority.',
      );
      onExecuted(result.execution.externalSaleStableId);
    } catch (error) {
      setFeedback(
        getApiErrorMessage(
          error,
          isZh
            ? '历史重建执行失败。'
            : 'Historical reconstruction execution failed.',
        ),
      );
    } finally {
      setExecuting(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">
          {isZh ? '历史销售重建' : 'Historical sales reconstruction'}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {isZh
            ? '只从已确认的 OTHER_DOCUMENT XLSX 证据生成计划。系统先核对 statement control totals，再用 planHash 锁定预览；2026-06-01 以前的资料不会在这里记收入。'
            : 'Plans are built only from confirmed OTHER_DOCUMENT XLSX evidence. Statement control totals are reconciled before a planHash is issued; pre-start evidence is never posted as revenue here.'}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.45fr)_auto] lg:items-end">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">
            {isZh ? '已确认 XLSX 证据' : 'Confirmed XLSX evidence'}
          </span>
          <select
            value={artifactStableId}
            disabled={loadingEvidence || previewing || executing}
            onChange={(event) => {
              setArtifactStableId(event.target.value);
              setPreview(null);
              setFeedback(null);
            }}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2"
          >
            {evidence.length === 0 ? (
              <option value="">
                {loadingEvidence
                  ? isZh
                    ? '加载中…'
                    : 'Loading…'
                  : isZh
                    ? '没有符合条件的 XLSX'
                    : 'No eligible XLSX'}
              </option>
            ) : null}
            {evidence.map((row) => (
              <option
                key={row.artifact.artifactStableId}
                value={row.artifact.artifactStableId}
              >
                {row.artifact.originalFilename ??
                  row.artifact.artifactStableId}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">
            {isZh ? '销售分类' : 'Sales classification'}
          </span>
          <input
            value={classificationStableId}
            disabled={previewing || executing}
            onChange={(event) => {
              setClassificationStableId(event.target.value);
              setPreview(null);
            }}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>

        <button
          type="button"
          disabled={!artifactStableId || previewing || executing}
          onClick={() => void runPreview()}
          className="min-h-11 rounded-xl bg-[#87362E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {previewing
            ? isZh
              ? '核对中…'
              : 'Reconciling…'
            : isZh
              ? '生成重建预览'
              : 'Build preview'}
        </button>
      </div>

      {selected ? (
        <p className="break-all text-xs text-slate-500">
          {selected.artifact.artifactStableId}
        </p>
      ) : null}

      {preview ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{preview.source.counterpartyName}</p>
              <p className="mt-1 text-sm text-slate-600">
                {preview.source.periodStartOn} → {preview.source.periodEndOn}
              </p>
            </div>
            <span
              className={
                preview.status === 'READY'
                  ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900'
                  : 'rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900'
              }
            >
              {preview.status}
              {preview.blockCode ? ` · ${preview.blockCode}` : ''}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label={isZh ? '净数量' : 'Net quantity'}
              value={preview.source.sourceQuantity}
            />
            <Metric
              label={isZh ? '未税销售' : 'Pre-tax sales'}
              value={money(preview.source.lineSubtotalCents)}
            />
            <Metric
              label="HST"
              value={money(preview.source.taxTotalCents)}
            />
            <Metric
              label={isZh ? '应收总额' : 'Receivable'}
              value={money(preview.source.totalReceivableCents)}
            />
            <Metric
              label={isZh ? '已付金额' : 'Paid amount'}
              value={money(preview.source.paidAmountCents)}
            />
            <Metric
              label={isZh ? '余额' : 'Balance due'}
              value={money(preview.source.balanceDueCents)}
            />
            <Metric
              label={isZh ? '源记录数' : 'Source rows'}
              value={String(preview.source.sourceRowCount)}
            />
            <Metric
              label={isZh ? '记账粒度' : 'Posting granularity'}
              value={preview.proposedSale.granularity}
            />
          </div>

          <div className="space-y-2">
            {preview.proposedSale.lines.map((line, index) => (
              <div
                key={`${line.description}-${line.unitPriceCents}-${index}`}
                className="flex flex-wrap justify-between gap-2 rounded-lg bg-white p-3 text-sm"
              >
                <span>
                  {line.description} · {line.quantity} {line.unit} ×{' '}
                  {money(line.unitPriceCents)}
                </span>
                <strong>{money(line.lineAmountCents)}</strong>
              </div>
            ))}
          </div>

          {preview.warnings.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {preview.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <p className="break-all font-mono text-[11px] text-slate-500">
            planHash: {preview.planHash}
          </p>

          {preview.status === 'READY' ? (
            <button
              type="button"
              disabled={executing}
              onClick={() => void execute()}
              className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {executing
                ? isZh
                  ? '写入中…'
                  : 'Posting…'
                : isZh
                  ? '按此预览写入 canonical Sale'
                  : 'Post canonical Sale'}
            </button>
          ) : (
            <p className="text-sm font-medium text-amber-800">
              {isZh
                ? '当前证据被后端阻止执行；不会写入 Journal。'
                : 'This evidence is blocked by backend policy and cannot write a Journal.'}
            </p>
          )}
        </div>
      ) : null}

      {feedback ? (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
