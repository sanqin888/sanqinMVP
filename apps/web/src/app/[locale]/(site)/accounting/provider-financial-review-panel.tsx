'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import {
  AccountingEvidenceViewer,
  type AccountingEvidenceSource,
} from './accounting-evidence-viewer';
import type {
  AccountingProviderFinancialDocument,
  AccountingProviderFinancialReviewDraftInput,
  AccountingProviderFinancialReviewRevision,
} from './contracts/provider-financial';
import type { ProviderSettlementDocumentPlan } from './contracts/settlements';
import { ProviderFinancialReviewComparison } from './provider-financial-review-comparison';
import { ProviderFinancialReviewEditor } from './provider-financial-review-editor';
import { ProviderFinancialReviewHistory } from './provider-financial-review-history';
import {
  applyReviewedProviderFinancialLines,
  buildPrefilledReviewCorrectionInputs,
  formatCad,
  latestConfirmedProviderReview,
  latestDraftProviderReview,
  reviewRowsForEditor,
  type ProviderFinancialReviewDraftRow,
} from './provider-financial-review-model';

type Props = {
  document: AccountingProviderFinancialDocument;
  evidence: AccountingEvidenceSource | null;
  isZh: boolean;
  readOnly?: boolean;
  controlTotalChecks?: ProviderSettlementDocumentPlan['controlTotalChecks'];
  previewStatus?: ProviderSettlementDocumentPlan['status'] | null;
  onPendingChange?: (pending: boolean) => void;
  onConfirmed?: () => void;
};

export function ProviderFinancialReviewPanel({
  document,
  evidence,
  isZh,
  readOnly = false,
  controlTotalChecks = [],
  previewStatus = null,
  onPendingChange,
  onConfirmed,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revisions, setRevisions] = useState<
    AccountingProviderFinancialReviewRevision[]
  >([]);
  const [rows, setRows] = useState<ProviderFinancialReviewDraftRow[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmedReview = useMemo(
    () => latestConfirmedProviderReview(revisions),
    [revisions],
  );
  const draftReview = useMemo(
    () => latestDraftProviderReview(revisions),
    [revisions],
  );
  const parserSnapshotDraft =
    draftReview?.effectiveSnapshotParserName ? draftReview : null;
  const parserSnapshotConfirmed =
    confirmedReview?.effectiveSnapshotParserName ? confirmedReview : null;
  const effectiveLines = useMemo(
    () => applyReviewedProviderFinancialLines(document, confirmedReview),
    [document, confirmedReview],
  );
  const seedEditor = useCallback(
    (nextRevisions: AccountingProviderFinancialReviewRevision[]) => {
      const draft = latestDraftProviderReview(nextRevisions);
      const confirmed = latestConfirmedProviderReview(nextRevisions);
      const seed = draft ?? confirmed;
      setRows(
        seed?.effectiveSnapshotParserName
          ? []
          : reviewRowsForEditor(document, seed),
      );
      setReviewNote(seed?.effectiveSnapshotParserName ? '' : (seed?.note ?? ''));
      setDirty(false);
    },
    [document],
  );

  const loadRevisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AccountingProviderFinancialReviewRevision[]>(
        '/accounting/provider-financial/' +
          encodeURIComponent(document.documentStableId) +
          '/review-revisions',
      );
      setRevisions(data);
      seedEditor(data);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [document.documentStableId, seedEditor]);

  useEffect(() => {
    void loadRevisions();
  }, [loadRevisions]);

  useEffect(() => {
    if (!loaded) return;
    onPendingChange?.(dirty || Boolean(draftReview));
  }, [dirty, draftReview, loaded, onPendingChange]);

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded && !loading) {
      await loadRevisions();
    }
  }

  function updateRow(
    sourceLineStableId: string,
    update: Partial<ProviderFinancialReviewDraftRow>,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.sourceLineStableId === sourceLineStableId
          ? { ...row, ...update }
          : row,
      ),
    );
    setDirty(true);
    setMessage(null);
  }

  async function saveDraft() {
    const built = buildPrefilledReviewCorrectionInputs(
      rows,
      document.lines,
    );
    if (built.error) {
      setError(
        isZh ? '无法保存：' + built.error : 'Cannot save: ' + built.error,
      );
      return;
    }
    const payload: AccountingProviderFinancialReviewDraftInput = {
      expectedDocumentRevision: document.revision,
      note: reviewNote.trim() || null,
      corrections: built.corrections,
    };
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await apiFetch<AccountingProviderFinancialReviewRevision>(
        '/accounting/provider-financial/' +
          encodeURIComponent(document.documentStableId) +
          '/review-revisions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const refreshed = await apiFetch<
        AccountingProviderFinancialReviewRevision[]
      >(
        '/accounting/provider-financial/' +
          encodeURIComponent(document.documentStableId) +
          '/review-revisions',
      );
      setRevisions(refreshed);
      seedEditor(refreshed);
      setMessage(
        isZh
          ? '已保存人工复核草稿 v' +
              saved.revision +
              '。确认前不会影响结算。'
          : 'Human review draft v' +
              saved.revision +
              ' saved. It does not affect settlement until confirmed.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function createParserReevaluationDraft() {
    setReevaluating(true);
    setError(null);
    setMessage(null);
    try {
      const created =
        await apiFetch<AccountingProviderFinancialReviewRevision>(
          '/accounting/provider-financial/' +
            encodeURIComponent(document.documentStableId) +
            '/parser-reevaluation',
          { method: 'POST' },
        );
      const refreshed = await apiFetch<
        AccountingProviderFinancialReviewRevision[]
      >(
        '/accounting/provider-financial/' +
          encodeURIComponent(document.documentStableId) +
          '/review-revisions',
      );
      setRevisions(refreshed);
      seedEditor(refreshed);
      setMessage(
        isZh
          ? '已用当前解析器生成复核草稿 v' +
              created.revision +
              '。请核对完整有效快照后再确认。'
          : 'Current parser created review draft v' +
              created.revision +
              '. Inspect the full effective snapshot before confirming it.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReevaluating(false);
    }
  }

  async function confirmDraft(
    revision: AccountingProviderFinancialReviewRevision,
  ) {
    setConfirmingId(revision.reviewRevisionStableId);
    setError(null);
    setMessage(null);
    try {
      const confirmed =
        await apiFetch<AccountingProviderFinancialReviewRevision>(
          '/accounting/provider-financial/' +
            encodeURIComponent(document.documentStableId) +
            '/review-revisions/' +
            encodeURIComponent(revision.reviewRevisionStableId) +
            '/confirm',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              expectedReviewHash: revision.reviewHash,
            }),
          },
        );
      const refreshed = await apiFetch<
        AccountingProviderFinancialReviewRevision[]
      >(
        '/accounting/provider-financial/' +
          encodeURIComponent(document.documentStableId) +
          '/review-revisions',
      );
      setRevisions(refreshed);
      seedEditor(refreshed);
      setMessage(
        isZh
          ? '人工复核 v' +
              confirmed.revision +
              ' 已确认。旧 Shadow Preview 已失效，请重新运行后再入账。'
          : 'Human review v' +
              confirmed.revision +
              ' confirmed. Any previous Shadow Preview is stale; rerun it before posting.',
      );
      onConfirmed?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setConfirmingId(null);
    }
  }

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
            {isZh ? '待入账值复核 / 修正' : 'Posting review / correction'}
          </span>
          <span className="mt-0.5 block text-xs text-violet-700">
            {!loaded
              ? isZh
                ? '展开后加载人工复核状态'
                : 'Open to load human review status'
              : confirmedReview
                ? isZh
                  ? '已确认 v' + confirmedReview.revision
                  : 'Confirmed v' + confirmedReview.revision
                : isZh
                  ? '当前使用收件箱确认后的预填值；修正以独立版本保存'
                  : 'Current values are prefilled from the confirmed Inbox result; corrections are stored as separate revisions'}
          </span>
        </span>
        <span className="text-sm text-violet-700">
          {expanded ? (isZh ? '收起' : 'Hide') : isZh ? '展开' : 'Open'}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-violet-200 px-4 py-4">
          <div className="flex flex-wrap justify-end gap-2">
            {!readOnly &&
            document.parserName === 'accounting-provider-financial' ? (
              <button
                type="button"
                onClick={() => void createParserReevaluationDraft()}
                disabled={
                  reevaluating ||
                  loading ||
                  dirty ||
                  Boolean(parserSnapshotDraft || parserSnapshotConfirmed)
                }
                className="rounded border border-violet-300 bg-violet-100 px-2.5 py-1.5 text-xs font-medium text-violet-900 disabled:opacity-50"
              >
                {reevaluating
                  ? isZh
                    ? '重新解析中…'
                    : 'Re-evaluating…'
                  : isZh
                    ? '用当前解析器重新评估'
                    : 'Re-evaluate with current parser'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void loadRevisions()}
              disabled={loading || dirty || reevaluating}
              className="rounded border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-800 disabled:opacity-50"
            >
              {loading
                ? isZh
                  ? '刷新中…'
                  : 'Refreshing…'
                : isZh
                  ? '刷新复核状态'
                  : 'Refresh review state'}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-white p-3 text-xs">
              <p className="text-slate-500">
                {isZh ? '原始凭证' : 'Source evidence'}
              </p>
              {evidence ? (
                <AccountingEvidenceViewer
                  evidence={evidence}
                  isZh={isZh}
                  className="mt-1 inline-block font-medium text-blue-700 hover:underline"
                />
              ) : (
                <p className="mt-1 text-slate-700">
                  {isZh ? '无可查看的原始文件' : 'No source evidence available'}
                </p>
              )}
            </div>
            <div className="rounded-lg bg-white p-3 text-xs">
              <p className="text-slate-500">
                {isZh ? '当前待入账版本' : 'Current posting-review version'}
              </p>
              <p className="mt-1 text-slate-800">
                {confirmedReview
                  ? parserSnapshotConfirmed
                    ? 'v' +
                      confirmedReview.revision +
                      ' · effective snapshot ' +
                      parserSnapshotConfirmed.effectiveSnapshotParserName +
                      ' v' +
                      (parserSnapshotConfirmed.effectiveSnapshotParserVersion ??
                        '—')
                    : 'v' +
                      confirmedReview.revision +
                      ' · ' +
                      confirmedReview.corrections.length +
                      ' correction(s)'
                  : isZh
                    ? '收件箱预填值'
                    : 'Inbox-prefilled values'}
              </p>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">
              {isZh ? '加载复核记录…' : 'Loading review history…'}
            </p>
          ) : null}
          {error ? (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}

          {loaded ? (
            <>
              <ProviderFinancialReviewComparison
                confirmedReview={confirmedReview}
                effectiveLines={effectiveLines}
                isZh={isZh}
                controlTotalChecks={controlTotalChecks}
                previewStatus={previewStatus}
              />

              {parserSnapshotDraft ? (
                <div className="space-y-3 rounded-lg border border-violet-300 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-violet-950">
                        {isZh
                          ? '待确认：当前解析器有效快照'
                          : 'Pending confirmation: current parser effective snapshot'}
                      </h4>
                      <p className="mt-1 font-mono text-[11px] text-violet-700">
                        {parserSnapshotDraft.effectiveSnapshotParserName} v
                        {parserSnapshotDraft.effectiveSnapshotParserVersion ??
                          '—'}{' '}
                        · {parserSnapshotDraft.effectiveLines.length}{' '}
                        {isZh ? '行' : 'lines'}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {isZh
                          ? '这是独立的待入账复核草稿；收件箱识别证据不会被改写，确认前也不会影响结算。'
                          : 'This is a separate posting-review draft. Inbox recognition evidence stays immutable and settlement is unchanged until confirmation.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void confirmDraft(parserSnapshotDraft)}
                      disabled={
                        confirmingId ===
                        parserSnapshotDraft.reviewRevisionStableId
                      }
                      className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 disabled:opacity-50"
                    >
                      {confirmingId ===
                      parserSnapshotDraft.reviewRevisionStableId
                        ? isZh
                          ? '确认中…'
                          : 'Confirming…'
                        : isZh
                          ? '确认解析器快照 v' +
                            parserSnapshotDraft.revision
                          : 'Confirm parser snapshot v' +
                            parserSnapshotDraft.revision}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {parserSnapshotDraft.effectiveLines.map((line) => (
                      <div
                        key={line.reviewedLineStableId}
                        className="grid gap-1 border-t border-slate-100 pt-2 text-xs first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto]"
                      >
                        <div>
                          <span className="font-medium text-slate-900">
                            #{line.lineNo} · {line.rawName ?? line.component}
                          </span>
                          <span className="ml-2 font-mono text-[10px] text-slate-500">
                            {line.component} · {line.postingTreatment} ·{' '}
                            {line.taxRole}
                          </span>
                        </div>
                        <span className="text-right font-medium">
                          {formatCad(line.amountCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {!readOnly ? (
                parserSnapshotDraft || parserSnapshotConfirmed ? (
                  <p className="rounded-lg bg-violet-100 px-3 py-2 text-xs text-violet-800">
                    {isZh
                      ? parserSnapshotDraft
                        ? '解析器快照草稿使用完整有效行集，不能与旧的一对一人工修正编辑器混合。请先核对并确认或保留该草稿。'
                        : '当前待入账值来自完整有效快照；旧的一对一修正编辑器已禁用，避免把结构化快照意外恢复成收件箱预填结构。'
                      : parserSnapshotDraft
                        ? 'An effective snapshot draft owns a full value set and cannot be mixed with the legacy one-to-one correction editor. Inspect and confirm or leave this draft unconfirmed.'
                        : 'The current posting-review values come from a full effective snapshot. The legacy one-to-one correction editor is disabled so it cannot accidentally restore the Inbox-prefilled structure.'}
                  </p>
                ) : (
                  <ProviderFinancialReviewEditor
                    document={document}
                    rows={rows}
                    reviewNote={reviewNote}
                    isZh={isZh}
                    saving={saving}
                    dirty={dirty}
                    draftReview={draftReview}
                    confirmingId={confirmingId}
                    onUpdateRow={updateRow}
                    onReviewNoteChange={(value) => {
                      setReviewNote(value);
                      setDirty(true);
                      setMessage(null);
                    }}
                    onSaveDraft={() => void saveDraft()}
                    onConfirmDraft={(revision) => void confirmDraft(revision)}
                  />
                )
              ) : (
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                  {isZh
                    ? '该记录已进入只读审计状态，不能再修改人工复核。'
                    : 'This record is in read-only audit state; human review can no longer be changed.'}
                </p>
              )}

              <ProviderFinancialReviewHistory
                revisions={revisions}
                isZh={isZh}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
