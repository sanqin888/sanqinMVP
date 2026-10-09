'use client';

import { useCallback, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type {
  AccountingFinancialComponent,
  AccountingFinancialPostingTreatment,
  AccountingFinancialTaxRole,
  AccountingProviderFinancialDocument,
} from '../contracts/provider-financial';
import type {
  ProviderPostedCorrectionCase,
  ProviderPostedCorrectionDraftLine,
  ProviderPostedCorrectionExecutionResult,
  ProviderPostedCorrectionPreview,
  ProviderPostedCorrectionReasonCode,
  ProviderPostedCorrectionRecord,
  ProviderPostedCorrectionStructuralChangeV2,
} from '../contracts/settlements';

const COMPONENTS: AccountingFinancialComponent[] = [
  'SALES',
  'SALES_TAX',
  'REFUND',
  'TIP',
  'COMMISSION',
  'COMMISSION_TAX',
  'PROCESSING_FEE',
  'PROCESSING_FEE_TAX',
  'PROMOTION',
  'SUBSIDY',
  'ADVERTISING',
  'ADVERTISING_TAX',
  'ADVERTISING_CREDIT',
  'CHARGEBACK',
  'CHARGEBACK_TAX',
  'PLATFORM_OTHER_FEE',
  'PLATFORM_OTHER_FEE_TAX',
  'ADJUSTMENT',
  'PAYOUT',
  'CONTROL_TOTAL',
  'OTHER',
];

const POSTING_TREATMENTS: AccountingFinancialPostingTreatment[] = [
  'POSTABLE',
  'CONTROL_TOTAL',
  'RECONCILIATION_ONLY',
  'UNCLASSIFIED',
];

const TAX_ROLES: AccountingFinancialTaxRole[] = [
  'NONE',
  'SALES_TAX',
  'INPUT_TAX',
  'OTHER_TAX',
];

const REASONS: ProviderPostedCorrectionReasonCode[] = [
  'EXTRACTION_ERROR',
  'AMOUNT_ERROR',
  'CLASSIFICATION_ERROR',
  'MISSING_COMPONENT',
  'BUSINESS_FACT_ERROR',
  'OTHER',
];

type EditableLine = ProviderPostedCorrectionDraftLine & {
  amountText: string;
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const toAmountText = (cents: number): string => (cents / 100).toFixed(2);

const parseAmountCents = (raw: string): number | null => {
  const value = raw.trim().replace(/,/g, '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const cents = Math.round(number * 100);
  return Number.isSafeInteger(cents) ? cents : null;
};

const toEditable = (line: ProviderPostedCorrectionDraftLine): EditableLine => ({
  ...line,
  amountText: toAmountText(line.amountCents),
});

const activeCase = (
  record: ProviderPostedCorrectionRecord | null,
): ProviderPostedCorrectionCase | null => {
  if (!record) return null;
  const active = record.corrections.filter(
    (correction) =>
      correction.status === 'DRAFT' || correction.status === 'READY',
  );
  return active[active.length - 1] ?? null;
};

const latestDraftInput = (
  correction: ProviderPostedCorrectionCase,
): ProviderPostedCorrectionCase['revisions'][number]['draftInput'] | null =>
  correction.revisions[correction.revisions.length - 1]?.draftInput ?? null;

const correctionBasePath = (documentStableId: string): string =>
  '/accounting/journal/provider-settlement/' +
  encodeURIComponent(documentStableId);

function statusClass(status: string): string {
  if (status === 'POSTED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'READY') return 'bg-amber-100 text-amber-900';
  if (status === 'CANCELLED') return 'bg-slate-200 text-slate-700';
  return 'bg-blue-100 text-blue-800';
}

function DeltaPreview({
  preview,
  isZh,
}: {
  preview: ProviderPostedCorrectionPreview;
  isZh: boolean;
}) {
  const debitCents = preview.deltaPosting.lines.reduce(
    (sum, line) => sum + line.debitCents,
    0,
  );
  const creditCents = preview.deltaPosting.lines.reduce(
    (sum, line) => sum + line.creditCents,
    0,
  );

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-950">
            {isZh ? 'Correction Preview / 差额' : 'Correction Preview / Delta'}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {isZh
              ? '这里只展示将追加写入的差额，不修改原始 Journal。'
              : 'This shows only the compensating delta that would be appended. The original Journal is never changed.'}
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-900">
          {preview.status}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-3 text-xs">
          <p className="text-slate-500">{isZh ? '策略' : 'Strategy'}</p>
          <p className="mt-1 font-semibold">{preview.authority.strategy}</p>
        </div>
        <div className="rounded-lg bg-white p-3 text-xs">
          <p className="text-slate-500">{isZh ? '差额借方' : 'Delta debit'}</p>
          <p className="mt-1 font-semibold">{money(debitCents)}</p>
        </div>
        <div className="rounded-lg bg-white p-3 text-xs">
          <p className="text-slate-500">{isZh ? '差额贷方' : 'Delta credit'}</p>
          <p className="mt-1 font-semibold">{money(creditCents)}</p>
        </div>
      </div>

      {preview.deltaPosting.lines.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
          <table className="min-w-[620px] w-full text-left text-xs">
            <thead className="border-b border-amber-100 bg-amber-50 text-slate-500">
              <tr>
                <th className="px-3 py-2">{isZh ? '科目' : 'Account'}</th>
                <th className="px-3 py-2">{isZh ? '分类' : 'Category'}</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.deltaPosting.lines.map((line) => (
                <tr
                  key={
                    line.accountStableId + ':' + (line.categoryStableId ?? '')
                  }
                >
                  <td className="px-3 py-2 font-mono">
                    {line.accountStableId}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {line.categoryStableId ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {line.debitCents ? money(line.debitCents) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {line.creditCents ? money(line.creditCents) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
          {isZh
            ? '业务权威有变化，但本次没有财务差额 Journal。'
            : 'Business authority changes, but this correction has no financial delta Journal.'}
        </p>
      )}

      <div className="rounded-lg bg-slate-950 p-3 text-xs text-slate-200">
        <p className="font-semibold text-white">planHash</p>
        <p className="mt-1 break-all font-mono leading-5">{preview.planHash}</p>
      </div>
    </div>
  );
}

export function ProviderPostedCorrectionPanel({
  document,
  isZh,
}: {
  document: AccountingProviderFinancialDocument;
  isZh: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [record, setRecord] = useState<ProviderPostedCorrectionRecord | null>(
    null,
  );
  const [rows, setRows] = useState<EditableLine[]>([]);
  const [reasonCode, setReasonCode] =
    useState<ProviderPostedCorrectionReasonCode>('AMOUNT_ERROR');
  const [note, setNote] = useState('');
  const [preview, setPreview] =
    useState<ProviderPostedCorrectionPreview | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postUnknown, setPostUnknown] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [structuralAcknowledged, setStructuralAcknowledged] = useState(false);
  const [structuralReadyHash, setStructuralReadyHash] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => activeCase(record), [record]);
  // SC-C is a read-compatible expansion. A v2 case and the historical
  // missing-component source must not be opened in the legacy fixed-line editor.
  const activeDraft = active ? latestDraftInput(active) : null;
  const structuralReadOnly =
    record?.currentEffective?.targetAuthoritySchema ===
      'accounting.provider-settlement-correction-target.v2' ||
    !!record?.currentEffective?.structuralBaseAuthorityHash ||
    activeDraft?.version === 2;
  const structuralDraft: ProviderPostedCorrectionStructuralChangeV2 | null =
    activeDraft?.version === 2
      ? activeDraft
      : (record?.currentEffective?.structuralProposal ?? null);
  const displayLines =
    record?.currentEffective?.effectiveLines?.map((line) => ({
      ...line,
      lineStableId: line.effectiveLineStableId,
    })) ??
    (record?.currentEffective?.draftInput?.version === 1
      ? record.currentEffective.draftInput.lines
      : []);
  const readyPreview =
    active?.status === 'READY' ? (active.readyPreview ?? preview) : preview;

  const seed = useCallback((next: ProviderPostedCorrectionRecord) => {
    const nextActive = activeCase(next);
    const draft =
      (nextActive ? latestDraftInput(nextActive) : null) ??
      next.currentEffective?.draftInput ??
      null;
    setRows(draft?.version === 1 ? draft.lines.map(toEditable) : []);
    setReasonCode(nextActive?.reasonCode ?? 'AMOUNT_ERROR');
    setNote(nextActive?.note ?? '');
    setPreview(
      nextActive?.status === 'READY' ? nextActive.readyPreview : null,
    );
    setConfirmationText('');
    setAcknowledged(false);
    setStructuralAcknowledged(false);
    setStructuralReadyHash('');
    setDirty(false);
    setPostUnknown(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiFetch<ProviderPostedCorrectionRecord>(
        correctionBasePath(document.documentStableId) + '/correction',
      );
      setRecord(next);
      seed(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [document.documentStableId, seed]);

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && !record && !loading) {
      await load();
    }
  }

  function updateLine(
    lineStableId: string,
    update: Partial<EditableLine>,
  ): void {
    setRows((current) =>
      current.map((line) =>
        line.lineStableId === lineStableId ? { ...line, ...update } : line,
      ),
    );
    setDirty(true);
    setPreview(null);
    setMessage(null);
    setError(null);
  }

  function buildTarget() {
    if (structuralReadOnly) {
      if (!structuralDraft) {
        throw new Error(
          isZh
            ? '没有可用的服务器结构性修正建议，请刷新。'
            : 'No server-owned structural proposal is available. Refresh first.',
        );
      }
      return structuralDraft;
    }
    const lines: ProviderPostedCorrectionDraftLine[] = [];
    for (const row of rows) {
      const amountCents = parseAmountCents(row.amountText);
      if (amountCents === null) {
        throw new Error(
          isZh
            ? `金额格式无效：${row.rawName ?? row.lineStableId}`
            : `Invalid amount: ${row.rawName ?? row.lineStableId}`,
        );
      }
      lines.push({
        lineStableId: row.lineStableId,
        rawCode: row.rawCode,
        rawName: row.rawName,
        component: row.component,
        postingTreatment: row.postingTreatment,
        taxRole: row.taxRole,
        amountCents,
      });
    }

    const expectedBaseAuthorityHash =
      (active ? latestDraftInput(active)?.expectedBaseAuthorityHash : null) ??
      record?.currentEffective?.targetAuthorityHash ??
      null;
    if (!expectedBaseAuthorityHash) {
      throw new Error(
        isZh
          ? '当前有效 authority hash 不可用，请刷新。'
          : 'Current-effective authority hash is unavailable. Refresh first.',
      );
    }
    return {
      version: 1 as const,
      expectedBaseAuthorityHash,
      lines,
    };
  }

  async function saveDraft() {
    if (!record || record.status !== 'READY') return;
    if (structuralReadOnly && (active || !structuralAcknowledged)) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const target = buildTarget();
      const base = correctionBasePath(document.documentStableId);
      const next = active
        ? await apiFetch<ProviderPostedCorrectionRecord>(
            base +
              '/corrections/' +
              encodeURIComponent(active.correctionStableId) +
              '/revise',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                expectedVersion: active.version,
                reasonCode: structuralReadOnly ? 'MISSING_COMPONENT' : reasonCode,
                note: note.trim() || null,
                target,
              }),
            },
          )
        : await apiFetch<ProviderPostedCorrectionRecord>(
            base + '/corrections',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reasonCode: structuralReadOnly ? 'MISSING_COMPONENT' : reasonCode,
                note: note.trim() || null,
                target,
              }),
            },
          );
      setRecord(next);
      seed(next);
      setMessage(
        isZh
          ? 'Correction 草稿已保存。下一步先生成 Preview。'
          : 'Correction draft saved. Build a Preview before continuing.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function buildPreview() {
    if (!active || dirty) return;
    setPreviewing(true);
    setError(null);
    setMessage(null);
    try {
      const next = await apiFetch<ProviderPostedCorrectionPreview>(
        correctionBasePath(document.documentStableId) +
          '/corrections/' +
          encodeURIComponent(active.correctionStableId) +
          '/preview',
      );
      setPreview(next);
      setConfirmationText('');
      setAcknowledged(false);
      setStructuralAcknowledged(false);
      setStructuralReadyHash('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreviewing(false);
    }
  }

  async function markReady() {
    if (!active || active.status !== 'DRAFT' || !preview || dirty) return;
    if (
      structuralReadOnly &&
      (!structuralAcknowledged ||
        structuralReadyHash.trim() !== preview.planHash)
    ) {
      return;
    }
    setTransitioning(true);
    setError(null);
    setMessage(null);
    try {
      const next = await apiFetch<ProviderPostedCorrectionRecord>(
        correctionBasePath(document.documentStableId) +
          '/corrections/' +
          encodeURIComponent(active.correctionStableId) +
          '/ready',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: active.version,
            expectedPlanHash: preview.planHash,
          }),
        },
      );
      setRecord(next);
      seed(next);
      setMessage(
        structuralReadOnly
          ? isZh
            ? '结构性 Correction 已冻结为 READY。v2 POST 仍处于后端阻止状态。'
            : 'Structural correction is READY. Backend v2 POST remains blocked.'
          : isZh
            ? 'Correction 已冻结为 READY。最终 POST 前仍会重新验证 authority。'
            : 'Correction is frozen as READY. Authority will be revalidated again before POST.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTransitioning(false);
    }
  }

  async function cancelCorrection() {
    if (!active) return;
    setTransitioning(true);
    setError(null);
    setMessage(null);
    try {
      const next = await apiFetch<ProviderPostedCorrectionRecord>(
        correctionBasePath(document.documentStableId) +
          '/corrections/' +
          encodeURIComponent(active.correctionStableId) +
          '/cancel',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedVersion: active.version }),
        },
      );
      setRecord(next);
      seed(next);
      setMessage(
        isZh ? 'Correction 已取消。' : 'Correction has been cancelled.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTransitioning(false);
    }
  }

  async function postCorrection() {
    if (
      !active ||
      active.status !== 'READY' ||
      !active.planHash ||
      confirmationText.trim() !== active.planHash ||
      !acknowledged ||
      postUnknown
    ) {
      return;
    }

    setPosting(true);
    setError(null);
    setMessage(null);
    let requestError: string | null = null;
    try {
      await apiFetch<ProviderPostedCorrectionExecutionResult>(
        correctionBasePath(document.documentStableId) +
          '/corrections/' +
          encodeURIComponent(active.correctionStableId) +
          '/post',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedPlanHash: active.planHash }),
        },
      );
    } catch (cause) {
      requestError = cause instanceof Error ? cause.message : String(cause);
    }

    try {
      const fresh = await apiFetch<ProviderPostedCorrectionRecord>(
        correctionBasePath(document.documentStableId) + '/correction',
      );
      setRecord(fresh);
      const posted = fresh.corrections.find(
        (correction) =>
          correction.correctionStableId === active.correctionStableId,
      );
      if (posted?.status === 'POSTED') {
        seed(fresh);
        setMessage(
          requestError
            ? isZh
              ? 'POST 请求结果不明确，但 fresh record 已验证为 POSTED。'
              : 'The POST response was unclear, but a fresh record verifies POSTED.'
            : isZh
              ? 'Correction 已 POSTED，并已通过 fresh record 复核。'
              : 'Correction is POSTED and verified by a fresh record.',
        );
      } else {
        setPostUnknown(true);
        setError(
          requestError
            ? isZh
              ? `POST 请求无法确认（${requestError}），fresh record 也未显示 POSTED。按 UNKNOWN 处理，不要重试。`
              : `The POST request could not be confirmed (${requestError}), and the fresh record is not POSTED. Treat the result as UNKNOWN and do not retry.`
            : isZh
              ? 'POST 返回后 fresh record 未显示 POSTED。按 UNKNOWN 处理，不要重试。'
              : 'The fresh record is not POSTED after the request. Treat the result as UNKNOWN and do not retry.',
        );
      }
    } catch (cause) {
      setPostUnknown(true);
      const refreshError = cause instanceof Error ? cause.message : String(cause);
      setError(
        isZh
          ? `POST 尝试后无法读取 fresh record（${refreshError}）。网络失败不代表写入失败；按 UNKNOWN 处理，不要重试。`
          : `Fresh-record verification failed after the POST attempt (${refreshError}). Network failure is not proof that the write failed. Treat the result as UNKNOWN and do not retry.`,
      );
    } finally {
      setPosting(false);
    }
  }

  const postReady =
    !structuralReadOnly &&
    active?.status === 'READY' &&
    Boolean(active.planHash) &&
    confirmationText.trim() === active.planHash &&
    acknowledged &&
    !postUnknown;

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/40">
      <button
        type="button"
        onClick={() => void toggleExpanded()}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span>
          <span className="block text-sm font-semibold text-violet-950">
            {isZh ? '已入账记录修正' : 'Correct posted record'}
          </span>
          <span className="mt-0.5 block text-xs text-violet-700">
            {isZh
              ? '原始 Journal 保持不变；修正通过独立 authority revision + compensating Journal 追加。'
              : 'The original Journal stays immutable. Corrections append separate authority revisions and compensating Journals.'}
          </span>
        </span>
        <span className="text-sm text-violet-700">
          {expanded ? (isZh ? '收起' : 'Hide') : isZh ? '展开' : 'Open'}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-violet-200 px-4 py-4">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || saving || transitioning || posting}
              className="rounded border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-800 disabled:opacity-50"
            >
              {loading
                ? isZh
                  ? '刷新中…'
                  : 'Refreshing…'
                : isZh
                  ? '刷新 Correction 状态'
                  : 'Refresh correction state'}
            </button>
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {message}
            </p>
          ) : null}

          {record?.status === 'BLOCKED' ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-900">
                {isZh ? 'Common Correction 已阻止' : 'Common Correction blocked'}
              </p>
              <p className="mt-1 text-xs leading-5 text-red-700">
                {record.blockReason}
              </p>
            </div>
          ) : null}

          {record?.currentEffective ? (
            <>
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-blue-950">
                      {isZh ? 'Current Effective 业务状态' : 'Current effective business state'}
                    </p>
                    <p className="mt-1 text-xs text-blue-800">
                      {isZh
                        ? '原始已入账 Journal 在卡片上方；这里展示 Original + 已 POSTED Corrections 后的当前业务 authority。'
                        : 'The original posted Journal is shown above. This is the current business authority after Original + all POSTED Corrections.'}
                    </p>
                  </div>
                  <span className="rounded bg-white px-2 py-1 font-mono text-[10px] text-blue-800">
                    {record.currentEffective.targetAuthorityHash.slice(0, 12)}…
                  </span>
                </div>
                <div className="mt-3 overflow-x-auto rounded-lg border border-blue-100 bg-white">
                  <table className="min-w-[760px] w-full text-left text-xs">
                    <thead className="border-b border-blue-100 bg-blue-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">{isZh ? '名称' : 'Name'}</th>
                        <th className="px-3 py-2">Component</th>
                        <th className="px-3 py-2">Treatment</th>
                        <th className="px-3 py-2">Tax role</th>
                        <th className="px-3 py-2 text-right">{isZh ? '金额' : 'Amount'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayLines.map((line) => (
                        <tr key={line.lineStableId}>
                          <td className="px-3 py-2">
                            {line.rawName ?? line.rawCode ?? line.lineStableId}
                          </td>
                          <td className="px-3 py-2 font-mono">{line.component}</td>
                          <td className="px-3 py-2 font-mono">
                            {line.postingTreatment}
                          </td>
                          <td className="px-3 py-2 font-mono">{line.taxRole}</td>
                          <td className="px-3 py-2 text-right font-medium">
                            {money(line.amountCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div
                className={
                  'space-y-3 rounded-xl border border-violet-200 bg-white p-4' +
                  (structuralReadOnly ? ' hidden' : '')
                }
              >
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {active
                      ? isZh
                        ? `继续 Correction · ${active.status}`
                        : `Continue correction · ${active.status}`
                      : isZh
                        ? '新建 Correction'
                        : 'New correction'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {isZh
                      ? '这里只编辑业务字段；Store / Provider / period / source-line provenance / 历史 reversal prerequisites 都由后端冻结。'
                      : 'Only business fields are editable. Store, provider, period, source-line provenance, and historical reversal prerequisites stay frozen server-side.'}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs">
                    <span className="text-slate-600">{isZh ? '原因' : 'Reason'}</span>
                    <select
                      value={reasonCode}
                      onChange={(event) => {
                        setReasonCode(
                          event.target.value as ProviderPostedCorrectionReasonCode,
                        );
                        setDirty(true);
                        setPreview(null);
                      }}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2"
                    >
                      {REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="text-slate-600">{isZh ? '备注' : 'Note'}</span>
                    <input
                      value={note}
                      onChange={(event) => {
                        setNote(event.target.value);
                        setDirty(true);
                        setPreview(null);
                      }}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
                      maxLength={2000}
                    />
                  </label>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-[1100px] w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-2 py-2">{isZh ? '名称' : 'Name'}</th>
                        <th className="px-2 py-2">Raw code</th>
                        <th className="px-2 py-2">Component</th>
                        <th className="px-2 py-2">Treatment</th>
                        <th className="px-2 py-2">Tax role</th>
                        <th className="px-2 py-2 text-right">{isZh ? '金额 $' : 'Amount $'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row) => (
                        <tr key={row.lineStableId}>
                          <td className="px-2 py-2">
                            <input
                              value={row.rawName ?? ''}
                              onChange={(event) =>
                                updateLine(row.lineStableId, {
                                  rawName: event.target.value || null,
                                })
                              }
                              className="w-48 rounded border border-slate-300 px-2 py-1.5"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              value={row.rawCode ?? ''}
                              onChange={(event) =>
                                updateLine(row.lineStableId, {
                                  rawCode: event.target.value || null,
                                })
                              }
                              className="w-44 rounded border border-slate-300 px-2 py-1.5 font-mono"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={row.component}
                              onChange={(event) =>
                                updateLine(row.lineStableId, {
                                  component:
                                    event.target.value as AccountingFinancialComponent,
                                })
                              }
                              className="rounded border border-slate-300 bg-white px-2 py-1.5"
                            >
                              {COMPONENTS.map((component) => (
                                <option key={component} value={component}>
                                  {component}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={row.postingTreatment}
                              onChange={(event) =>
                                updateLine(row.lineStableId, {
                                  postingTreatment:
                                    event.target
                                      .value as AccountingFinancialPostingTreatment,
                                })
                              }
                              className="rounded border border-slate-300 bg-white px-2 py-1.5"
                            >
                              {POSTING_TREATMENTS.map((treatment) => (
                                <option key={treatment} value={treatment}>
                                  {treatment}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={row.taxRole}
                              onChange={(event) =>
                                updateLine(row.lineStableId, {
                                  taxRole:
                                    event.target.value as AccountingFinancialTaxRole,
                                })
                              }
                              className="rounded border border-slate-300 bg-white px-2 py-1.5"
                            >
                              {TAX_ROLES.map((taxRole) => (
                                <option key={taxRole} value={taxRole}>
                                  {taxRole}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              value={row.amountText}
                              onChange={(event) =>
                                updateLine(row.lineStableId, {
                                  amountText: event.target.value,
                                })
                              }
                              inputMode="decimal"
                              className="w-28 rounded border border-slate-300 px-2 py-1.5 text-right font-mono"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveDraft()}
                    disabled={
                      !dirty || saving || transitioning || posting || postUnknown
                    }
                    className="rounded bg-violet-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {saving
                      ? isZh
                        ? '保存中…'
                        : 'Saving…'
                      : active
                        ? isZh
                          ? '保存新 Revision'
                          : 'Save new revision'
                        : isZh
                          ? '创建 Correction 草稿'
                          : 'Create correction draft'}
                  </button>
                  {active ? (
                    <button
                      type="button"
                      onClick={() => void buildPreview()}
                      disabled={
                        dirty ||
                        previewing ||
                        transitioning ||
                        posting ||
                        postUnknown
                      }
                      className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50"
                    >
                      {previewing
                        ? isZh
                          ? 'Preview 中…'
                          : 'Previewing…'
                        : isZh
                          ? '生成 Preview'
                          : 'Build Preview'}
                    </button>
                  ) : null}
                  {active ? (
                    <button
                      type="button"
                      onClick={() => void cancelCorrection()}
                      disabled={transitioning || posting || postUnknown}
                      className="rounded border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                    >
                      {isZh ? '取消 Correction' : 'Cancel correction'}
                    </button>
                  ) : null}
                </div>
              </div>
              {structuralReadOnly ? (
                <div className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
                  <div>
                    <p className="font-semibold">
                      {isZh
                        ? '结构性修正 v2 · 缺失费用补录'
                        : 'Structural v2 correction · missing fee lines'}
                    </p>
                    <p className="mt-1 leading-5">
                      {isZh
                        ? '原始 10 行、原始 Journal 及来源证据保持不变。下面仅显示服务器根据原账单控制总额验证的新增行，不允许在这里修改金额或冒充原始来源行。'
                        : 'The ten original lines, posted Journal and source evidence stay immutable. Only server-validated added lines are shown; amounts and source provenance are not browser-editable.'}
                    </p>
                  </div>
                  {structuralDraft ? (
                    <>
                      <div className="rounded-lg border border-amber-200 bg-white p-3">
                        <p className="font-semibold">MISSING_COMPONENT · ADD × 2</p>
                        <p className="mt-1 break-all font-mono text-[10px] text-slate-600">
                          structural base: {structuralDraft.expectedBaseAuthorityHash}
                        </p>
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[620px] text-left">
                            <thead className="border-b border-slate-200 text-slate-500">
                              <tr>
                                <th className="py-2">{isZh ? '新增费用' : 'Added expense'}</th>
                                <th className="py-2">Component</th>
                                <th className="py-2">Tax role</th>
                                <th className="py-2 text-right">{isZh ? '账单金额' : 'Statement amount'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {structuralDraft.changes.map((change) => (
                                <tr key={change.values.rawName ?? change.values.component}>
                                  <td className="py-2">{change.values.rawName}</td>
                                  <td className="py-2 font-mono">{change.values.component}</td>
                                  <td className="py-2 font-mono">{change.values.taxRole}</td>
                                  <td className="py-2 text-right font-semibold">
                                    {money(change.values.amountCents)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-2 break-all text-[10px] text-slate-500">
                          {isZh ? '证据单据' : 'Evidence document'}:
                          {' '}{record.document.documentStableId}
                        </p>
                      </div>
                      {!active ? (
                        <label className="block text-xs">
                          <span className="font-medium">
                            {isZh ? '修正原因备注（可选）' : 'Correction note (optional)'}
                          </span>
                          <textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            maxLength={2000}
                            rows={2}
                            className="mt-1 w-full rounded-lg border border-amber-300 bg-white p-2"
                            disabled={saving || transitioning || posting}
                          />
                        </label>
                      ) : null}
                      {active?.status !== 'READY' ? (
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={structuralAcknowledged}
                            onChange={(event) =>
                              setStructuralAcknowledged(event.target.checked)
                            }
                            className="mt-0.5"
                          />
                          <span>
                            {active
                              ? isZh
                                ? '我已对照 Preview 的 Delta 和完整 planHash，确认新增费用及税额。'
                                : 'I reviewed the Preview delta and full planHash for both added fees.'
                              : isZh
                                ? '我已核对原始账单、服务器建议的两条新增费用及来源。'
                                : 'I reviewed the original statement and both server-proposed missing lines.'}
                          </span>
                        </label>
                      ) : null}
                      {active?.status === 'DRAFT' &&
                      preview?.status === 'READY' ? (
                        <label className="block">
                          <span className="font-medium">
                            {isZh
                              ? '核对并输入完整 Preview planHash'
                              : 'Verify and enter the full Preview planHash'}
                          </span>
                          <input
                            type="text"
                            value={structuralReadyHash}
                            onChange={(event) =>
                              setStructuralReadyHash(event.target.value)
                            }
                            placeholder="planHash (64 hex characters)"
                            className="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-2 font-mono"
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </label>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {!active ? (
                          <button
                            type="button"
                            onClick={() => void saveDraft()}
                            disabled={
                              !structuralAcknowledged ||
                              saving ||
                              transitioning ||
                              posting ||
                              postUnknown ||
                              record.status !== 'READY'
                            }
                            className="rounded bg-violet-700 px-3 py-2 font-semibold text-white disabled:opacity-50"
                          >
                            {isZh ? '创建 v2 Correction 草稿' : 'Create v2 correction draft'}
                          </button>
                        ) : null}
                        {active?.status === 'DRAFT' ? (
                          <button
                            type="button"
                            onClick={() => void buildPreview()}
                            disabled={previewing || transitioning || posting || postUnknown}
                            className="rounded border border-amber-400 bg-white px-3 py-2 font-semibold disabled:opacity-50"
                          >
                            {previewing ? (isZh ? '预览中…' : 'Previewing…') : 'Build Preview'}
                          </button>
                        ) : null}
                        {active?.status === 'DRAFT' &&
                        preview?.status === 'READY' ? (
                          <button
                            type="button"
                            onClick={() => void markReady()}
                            disabled={
                              !structuralAcknowledged ||
                              structuralReadyHash.trim() !== preview.planHash ||
                              transitioning ||
                              posting ||
                              postUnknown
                            }
                            className="rounded bg-amber-700 px-3 py-2 font-semibold text-white disabled:opacity-50"
                          >
                            {isZh ? '确认 Delta / planHash → READY' : 'Confirm delta / planHash → READY'}
                          </button>
                        ) : null}
                        {active ? (
                          <button
                            type="button"
                            onClick={() => void cancelCorrection()}
                            disabled={transitioning || posting || postUnknown}
                            className="rounded border border-red-300 bg-white px-3 py-2 font-semibold text-red-800 disabled:opacity-50"
                          >
                            {isZh ? '取消 Correction' : 'Cancel correction'}
                          </button>
                        ) : null}
                      </div>
                      {active?.status === 'READY' ? (
                        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">
                          {isZh
                            ? 'v2 修正已达到 READY，但正式 POST 仍被服务器阻止。需单独审批受控生产验证后才能开放，不会在本页自动入账。'
                            : 'The v2 correction is READY, but backend POST remains blocked until a separately approved controlled production verification. This page will not post it.'}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p>
                      {isZh
                        ? '当前 v2 authority 只读，或缺少受控结构性修正建议。旧版固定行编辑器不可用。'
                        : 'Current v2 authority is read-only, or no audited structural proposal is available. The legacy editor remains disabled.'}
                    </p>
                  )}
                </div>
              ) : null}
            </>
          ) : null}

          {readyPreview ? (
            <DeltaPreview preview={readyPreview} isZh={isZh} />
          ) : null}

          {!structuralReadOnly &&
          active?.status === 'DRAFT' &&
          preview?.status === 'READY' &&
          !dirty ? (
            <button
              type="button"
              onClick={() => void markReady()}
              disabled={transitioning || posting || postUnknown}
              className="rounded bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {transitioning
                ? isZh
                  ? '冻结中…'
                  : 'Freezing…'
                : isZh
                  ? '确认 Preview 并冻结为 READY'
                  : 'Confirm Preview and mark READY'}
            </button>
          ) : null}

          {!structuralReadOnly && active?.status === 'READY' && active.planHash ? (
            <div className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4">
              <div>
                <p className="text-sm font-semibold text-red-950">
                  {isZh ? '最终 POST 授权闸门' : 'Final POST authorization gate'}
                </p>
                <p className="mt-1 text-xs leading-5 text-red-800">
                  {isZh
                    ? '这一步会追加不可变 Correction Journal，并把该 Case 标记为 POSTED。原始 Journal 不会被修改。请输入完整 planHash 并勾选确认。'
                    : 'This appends immutable Correction Journals and marks the Case POSTED. The original Journal is not modified. Enter the full planHash and acknowledge the action.'}
                </p>
              </div>
              <p className="break-all rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-200">
                {active.planHash}
              </p>
              <input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder={isZh ? '输入完整 planHash' : 'Enter full planHash'}
                className="w-full rounded border border-red-300 bg-white px-3 py-2 font-mono text-xs"
              />
              <label className="flex items-start gap-2 text-xs text-red-900">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  {isZh
                    ? '我确认已核对业务字段、Delta 和 planHash，并理解这不是 Undo。'
                    : 'I reviewed the business fields, Delta, and planHash and understand this is not an Undo.'}
                </span>
              </label>
              <button
                type="button"
                onClick={() => void postCorrection()}
                disabled={!postReady || posting}
                className="rounded bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {posting
                  ? isZh
                    ? 'POST 并复核中…'
                    : 'Posting and verifying…'
                  : isZh
                    ? 'POST Correction'
                    : 'POST correction'}
              </button>
            </div>
          ) : null}

          {record?.corrections.length ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                {isZh ? 'Correction 历史' : 'Correction history'}
              </p>
              {[...record.corrections].reverse().map((correction) => (
                <div
                  key={correction.correctionStableId}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          'rounded-full px-2 py-0.5 font-semibold ' +
                          statusClass(correction.status)
                        }
                      >
                        {correction.status}
                      </span>
                      <span className="font-mono text-slate-600">
                        {correction.correctionStableId}
                      </span>
                    </div>
                    <span className="text-slate-500">
                      {new Date(correction.createdAt).toLocaleString(
                        isZh ? 'zh-CN' : 'en-CA',
                      )}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <p>
                      <span className="text-slate-500">
                        {isZh ? '原因：' : 'Reason: '}
                      </span>
                      {correction.reasonCode}
                    </p>
                    <p>
                      <span className="text-slate-500">Revision: </span>
                      {correction.revisions.length}
                    </p>
                    <p>
                      <span className="text-slate-500">
                        {isZh ? '输出 Journal：' : 'Journal outputs: '}
                      </span>
                      {correction.journalOutputs.length}
                    </p>
                  </div>
                  {correction.note ? (
                    <p className="mt-2 text-slate-600">{correction.note}</p>
                  ) : null}
                  {correction.journalOutputs.length ? (
                    <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-500">
                      {correction.journalOutputs.map((output) => (
                        <p key={output.outputStableId}>
                          {output.role} #{output.sequence} ·{' '}
                          {output.journal.entryStableId}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {isZh
                ? '尚无 Posted Correction 历史。'
                : 'No posted-correction history yet.'}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
