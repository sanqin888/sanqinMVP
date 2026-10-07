import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type {
  AccountingExpenseDocument,
  ExpensePostedCorrectionCase,
  ExpensePostedCorrectionDraftInput,
  ExpensePostedCorrectionExecutionResult,
  ExpensePostedCorrectionPreview,
  ExpensePostedCorrectionReasonCode,
  ExpensePostedCorrectionRecord,
} from '../contracts/expenses';
import type {
  EditableExpenseCorrectionAllocation,
  EditableExpenseCorrectionSplit,
} from './expense-posted-correction-editor';

const moneyText = (cents: number): string => (cents / 100).toFixed(2);

const parseCents = (
  raw: string,
  field: string,
  positive: boolean,
): number => {
  const value = raw.trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error(
      `${field} must be a non-negative amount with at most 2 decimals`,
    );
  }
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || (positive && cents <= 0)) {
    throw new Error(`${field} is invalid`);
  }
  return cents;
};

const activeCase = (
  record: ExpensePostedCorrectionRecord | null,
): ExpensePostedCorrectionCase | null => {
  const active =
    record?.corrections.filter(
      (correction) =>
        correction.status === 'DRAFT' || correction.status === 'READY',
    ) ?? [];
  return active[active.length - 1] ?? null;
};

const latestDraft = (
  correction: ExpensePostedCorrectionCase | null,
): ExpensePostedCorrectionDraftInput | null =>
  correction?.revisions[correction.revisions.length - 1]?.draftInput ?? null;

const correctionBasePath = (documentStableId: string): string =>
  '/accounting/journal/expense/' + encodeURIComponent(documentStableId);

export const EXPENSE_CORRECTION_REASONS: ExpensePostedCorrectionReasonCode[] = [
  'EXTRACTION_ERROR',
  'AMOUNT_ERROR',
  'CLASSIFICATION_ERROR',
  'MISSING_COMPONENT',
  'BUSINESS_FACT_ERROR',
  'OTHER',
];

export function useExpensePostedCorrectionWorkflow(params: {
  document: AccountingExpenseDocument;
  isZh: boolean;
  onRecordChanged: () => Promise<void> | void;
}) {
  const { document, isZh, onRecordChanged } = params;
  const [record, setRecord] = useState<ExpensePostedCorrectionRecord | null>(
    null,
  );
  const [totalText, setTotalText] = useState('');
  const [memo, setMemo] = useState('');
  const [splits, setSplits] = useState<EditableExpenseCorrectionSplit[]>([]);
  const [allocations, setAllocations] = useState<
    EditableExpenseCorrectionAllocation[]
  >([]);
  const [allocationsTouched, setAllocationsTouched] = useState(false);
  const [reasonCode, setReasonCode] =
    useState<ExpensePostedCorrectionReasonCode>('AMOUNT_ERROR');
  const [note, setNote] = useState('');
  const [preview, setPreview] =
    useState<ExpensePostedCorrectionPreview | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postUnknown, setPostUnknown] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => activeCase(record), [record]);
  const readyPreview =
    active?.status === 'READY' ? (active.readyPreview ?? preview) : preview;

  const seed = useCallback((next: ExpensePostedCorrectionRecord) => {
    const nextActive = activeCase(next);
    const activeDraft = latestDraft(nextActive);
    const draft = activeDraft ?? next.currentEffective?.draftInput ?? null;
    const v2 = next.document.fundingAttributionVersion === 2;

    setTotalText(draft ? moneyText(draft.totalCents) : '');
    setMemo(draft?.memo ?? '');
    setSplits(
      draft?.splits.map((split) => ({
        splitStableId: split.splitStableId,
        categoryStableId: split.categoryStableId,
        amountText: moneyText(split.amountCents),
        taxText: moneyText(split.taxCents),
        paidFromAccountStableId: split.paidFromAccountStableId ?? null,
        fundingTouched: v2 ? Boolean(activeDraft) : false,
      })) ?? [],
    );
    setAllocations(
      draft?.paymentAllocations?.map((allocation) => ({
        paymentAllocationStableId: allocation.paymentAllocationStableId,
        accountStableId: allocation.accountStableId,
        amountText: moneyText(allocation.amountCents),
      })) ?? [],
    );
    setAllocationsTouched(Boolean(activeDraft));
    setReasonCode(nextActive?.reasonCode ?? 'AMOUNT_ERROR');
    setNote(nextActive?.note ?? '');
    setPreview(
      nextActive?.status === 'READY' ? nextActive.readyPreview : null,
    );
    setDirty(false);
    setConfirmationText('');
    setAcknowledged(false);
    setPostUnknown(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiFetch<ExpensePostedCorrectionRecord>(
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

  useEffect(() => {
    void load();
  }, [load]);

  function markDirty() {
    setDirty(true);
    setPreview(null);
    setMessage(null);
    setError(null);
  }

  function buildTarget(): ExpensePostedCorrectionDraftInput {
    if (!record?.currentEffective) {
      throw new Error(
        isZh
          ? 'Current Effective authority 不可用，请刷新。'
          : 'Current Effective authority is unavailable. Refresh first.',
      );
    }
    const mappedSplits = splits.map((split, index) => ({
      splitStableId: split.splitStableId,
      categoryStableId: split.categoryStableId,
      amountCents: parseCents(
        split.amountText,
        `split ${index + 1} amount`,
        false,
      ),
      taxCents: parseCents(
        split.taxText,
        `split ${index + 1} tax`,
        false,
      ),
      ...(record.document.fundingAttributionVersion === 2 &&
      split.fundingTouched
        ? { paidFromAccountStableId: split.paidFromAccountStableId }
        : {}),
    }));

    return {
      version: 1,
      expectedBaseAuthorityHash:
        latestDraft(active)?.expectedBaseAuthorityHash ??
        record.currentEffective.targetAuthorityHash,
      totalCents: parseCents(totalText, 'total', true),
      memo: memo.trim() || null,
      splits: mappedSplits,
      ...(record.document.fundingAttributionVersion === 1 &&
      allocationsTouched
        ? {
            paymentAllocations: allocations.map((allocation, index) => ({
              paymentAllocationStableId:
                allocation.paymentAllocationStableId,
              accountStableId: allocation.accountStableId,
              amountCents: parseCents(
                allocation.amountText,
                `allocation ${index + 1}`,
                true,
              ),
            })),
          }
        : {}),
    };
  }

  async function saveDraft() {
    if (!record || record.status !== 'READY' || postUnknown) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const target = buildTarget();
      const base = correctionBasePath(document.documentStableId);
      const next = active
        ? await apiFetch<ExpensePostedCorrectionRecord>(
            `${base}/corrections/${encodeURIComponent(active.correctionStableId)}/revise`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                expectedVersion: active.version,
                reasonCode,
                note: note.trim() || null,
                target,
              }),
            },
          )
        : await apiFetch<ExpensePostedCorrectionRecord>(
            base + '/corrections',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reasonCode,
                note: note.trim() || null,
                target,
              }),
            },
          );
      setRecord(next);
      seed(next);
      await onRecordChanged();
      setMessage(
        isZh
          ? 'Correction DRAFT 已保存。下一步生成 Preview；若 funding unresolved，后端会明确 BLOCK。'
          : 'Correction DRAFT saved. Build Preview next; unresolved funding will be explicitly blocked by the backend.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function buildPreview() {
    if (!active || dirty || postUnknown) return;
    setPreviewing(true);
    setError(null);
    setMessage(null);
    try {
      const next = await apiFetch<ExpensePostedCorrectionPreview>(
        `${correctionBasePath(document.documentStableId)}/corrections/${encodeURIComponent(active.correctionStableId)}/preview`,
      );
      setPreview(next);
      setConfirmationText('');
      setAcknowledged(false);
      if (next.status === 'NOOP') {
        setMessage(
          isZh
            ? 'Preview 为 NOOP：没有 compensating Journal，不能进入 READY。'
            : 'Preview is NOOP: there is no compensating Journal and it cannot become READY.',
        );
      }
    } catch (cause) {
      setError(
        isZh
          ? `Preview BLOCKED：${cause instanceof Error ? cause.message : String(cause)}`
          : `Preview blocked: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setPreviewing(false);
    }
  }

  async function markReady() {
    if (
      !active ||
      active.status !== 'DRAFT' ||
      preview?.status !== 'READY' ||
      dirty ||
      postUnknown
    ) {
      return;
    }
    setTransitioning(true);
    setError(null);
    try {
      const next = await apiFetch<ExpensePostedCorrectionRecord>(
        `${correctionBasePath(document.documentStableId)}/corrections/${encodeURIComponent(active.correctionStableId)}/ready`,
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
      await onRecordChanged();
      setMessage(
        isZh
          ? 'Correction 已冻结为 READY；POST 前仍会重新验证 authority 和 planHash。'
          : 'Correction is READY; authority and planHash will be revalidated before POST.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTransitioning(false);
    }
  }

  async function cancelCorrection() {
    if (!active || postUnknown) return;
    setTransitioning(true);
    setError(null);
    try {
      const next = await apiFetch<ExpensePostedCorrectionRecord>(
        `${correctionBasePath(document.documentStableId)}/corrections/${encodeURIComponent(active.correctionStableId)}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedVersion: active.version }),
        },
      );
      setRecord(next);
      seed(next);
      await onRecordChanged();
      setMessage(isZh ? 'Correction 已取消。' : 'Correction cancelled.');
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
      await apiFetch<ExpensePostedCorrectionExecutionResult>(
        `${correctionBasePath(document.documentStableId)}/corrections/${encodeURIComponent(active.correctionStableId)}/post`,
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
      const fresh = await apiFetch<ExpensePostedCorrectionRecord>(
        correctionBasePath(document.documentStableId) + '/correction',
      );
      setRecord(fresh);
      const posted = fresh.corrections.find(
        (correction) =>
          correction.correctionStableId === active.correctionStableId,
      );
      if (posted?.status === 'POSTED') {
        seed(fresh);
        await onRecordChanged();
        setMessage(
          requestError
            ? isZh
              ? 'POST 响应不明确，但 fresh authoritative record 已证明为 POSTED。'
              : 'The POST response was unclear, but a fresh authoritative record proves POSTED.'
            : isZh
              ? 'Correction 已 POSTED，并通过 fresh authoritative record 复核。'
              : 'Correction is POSTED and verified by a fresh authoritative record.',
        );
      } else {
        setPostUnknown(true);
        setError(
          requestError
            ? isZh
              ? `POST 无法确认（${requestError}），fresh read 也不能证明 POSTED。进入 UNKNOWN / no-retry，请勿重复 POST。`
              : `POST could not be confirmed (${requestError}) and fresh read does not prove POSTED. Entering UNKNOWN / no-retry; do not POST again.`
            : isZh
              ? 'fresh read 不能证明 POSTED。进入 UNKNOWN / no-retry，请勿重复 POST。'
              : 'Fresh read does not prove POSTED. Entering UNKNOWN / no-retry; do not POST again.',
        );
      }
    } catch (cause) {
      setPostUnknown(true);
      const refreshError =
        cause instanceof Error ? cause.message : String(cause);
      setError(
        isZh
          ? `POST 后 fresh read 失败（${refreshError}）。网络失败不代表写入失败；进入 UNKNOWN / no-retry。`
          : `Fresh read failed after POST (${refreshError}). Network failure is not proof of write failure; entering UNKNOWN / no-retry.`,
      );
    } finally {
      setPosting(false);
    }
  }

  return {
    record,
    active,
    readyPreview,
    totalText,
    setTotalText,
    memo,
    setMemo,
    splits,
    setSplits,
    allocations,
    setAllocations,
    setAllocationsTouched,
    reasonCode,
    setReasonCode,
    note,
    setNote,
    dirty,
    loading,
    saving,
    previewing,
    transitioning,
    posting,
    postUnknown,
    confirmationText,
    setConfirmationText,
    acknowledged,
    setAcknowledged,
    message,
    error,
    preview,
    markDirty,
    load,
    saveDraft,
    buildPreview,
    markReady,
    cancelCorrection,
    postCorrection,
  };
}
