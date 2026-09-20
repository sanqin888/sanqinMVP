'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AccountingInboxParseResult } from './contracts/inbox';
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
  buildReviewCorrectionInputs,
  latestConfirmedProviderReview,
  latestDraftProviderReview,
  newReviewRowForLine,
  reviewRowsFromRevision,
  type ProviderFinancialReviewDraftRow,
} from './provider-financial-review-model';

type Props = {
  document: AccountingProviderFinancialDocument;
  evidenceUrl: string | null;
  parseResult: AccountingInboxParseResult | null;
  isZh: boolean;
  readOnly?: boolean;
  controlTotalChecks?: ProviderSettlementDocumentPlan['controlTotalChecks'];
  previewStatus?: ProviderSettlementDocumentPlan['status'] | null;
  onConfirmed?: () => void;
};

export function ProviderFinancialReviewPanel({
  document,
  evidenceUrl,
  parseResult,
  isZh,
  readOnly = false,
  controlTotalChecks = [],
  previewStatus = null,
  onConfirmed,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revisions, setRevisions] = useState<
    AccountingProviderFinancialReviewRevision[]
  >([]);
  const [rows, setRows] = useState<ProviderFinancialReviewDraftRow[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const effectiveLines = useMemo(
    () => applyReviewedProviderFinancialLines(document, confirmedReview),
    [document, confirmedReview],
  );
  const usedLineStableIds = new Set(rows.map((row) => row.sourceLineStableId));
  const availableLines = document.lines.filter(
    (line) => !usedLineStableIds.has(line.lineStableId),
  );
  const recognitionEngine =
    parseResult?.textRecognitionEngine ??
    parseResult?.ocrEngine ??
    document.parserName;
  const recognitionConfidence = parseResult?.confidence ?? null;

  function seedEditor(nextRevisions: AccountingProviderFinancialReviewRevision[]) {
    const draft = latestDraftProviderReview(nextRevisions);
    const confirmed = latestConfirmedProviderReview(nextRevisions);
    const seed = draft ?? confirmed;
    setRows(reviewRowsFromRevision(document, seed));
    setReviewNote(seed?.note ?? '');
    setDirty(false);
  }

  async function loadRevisions() {
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
  }

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

  function addCorrection() {
    const line = availableLines[0];
    if (!line) return;
    setRows((current) => [...current, newReviewRowForLine(line)]);
    setDirty(true);
    setMessage(null);
  }

  function removeCorrection(sourceLineStableId: string) {
    setRows((current) =>
      current.filter((row) => row.sourceLineStableId !== sourceLineStableId),
    );
    setDirty(true);
    setMessage(null);
  }

  function changeCorrectionLine(
    currentSourceLineStableId: string,
    nextSourceLineStableId: string,
  ) {
    const line = document.lines.find(
      (candidate) => candidate.lineStableId === nextSourceLineStableId,
    );
    if (!line) return;
    setRows((current) =>
      current.map((row) =>
        row.sourceLineStableId === currentSourceLineStableId
          ? newReviewRowForLine(line)
          : row,
      ),
    );
    setDirty(true);
    setMessage(null);
  }

  async function saveDraft() {
    const built = buildReviewCorrectionInputs(rows);
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
            {isZh ? '人工复核 / 修正' : 'Human review / correction'}
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
                  ? '机器结果保持原样；人工修正以独立版本保存'
                  : 'Machine evidence stays immutable; human corrections are separate revisions'}
          </span>
        </span>
        <span className="text-sm text-violet-700">
          {expanded ? (isZh ? '收起' : 'Hide') : isZh ? '展开' : 'Open'}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-violet-200 px-4 py-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void loadRevisions()}
              disabled={loading || dirty}
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

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-white p-3 text-xs">
              <p className="text-slate-500">
                {isZh ? '原始证据' : 'Source evidence'}
              </p>
              {evidenceUrl ? (
                <a
                  href={evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block font-medium text-blue-700 hover:underline"
                >
                  {isZh ? '打开原始文件' : 'Open original evidence'}
                </a>
              ) : (
                <p className="mt-1 text-slate-700">
                  {isZh ? '无可直接打开的文件链接' : 'No direct evidence link'}
                </p>
              )}
            </div>
            <div className="rounded-lg bg-white p-3 text-xs">
              <p className="text-slate-500">
                {isZh ? '识别 / 解析' : 'Recognition / parser'}
              </p>
              <p className="mt-1 font-mono text-slate-800">
                {recognitionEngine}
                {recognitionConfidence ? ' · ' + recognitionConfidence : ''}
              </p>
            </div>
            <div className="rounded-lg bg-white p-3 text-xs">
              <p className="text-slate-500">
                {isZh ? '当前有效版本' : 'Current effective review'}
              </p>
              <p className="mt-1 text-slate-800">
                {confirmedReview
                  ? 'v' +
                    confirmedReview.revision +
                    ' · ' +
                    confirmedReview.corrections.length +
                    ' correction(s)'
                  : isZh
                    ? '机器结果'
                    : 'Machine result'}
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
                document={document}
                confirmedReview={confirmedReview}
                effectiveLines={effectiveLines}
                isZh={isZh}
                controlTotalChecks={controlTotalChecks}
                previewStatus={previewStatus}
              />

              {!readOnly ? (
                <ProviderFinancialReviewEditor
                  document={document}
                  rows={rows}
                  reviewNote={reviewNote}
                  isZh={isZh}
                  saving={saving}
                  dirty={dirty}
                  draftReview={draftReview}
                  confirmingId={confirmingId}
                  onAddCorrection={addCorrection}
                  onUpdateRow={updateRow}
                  onChangeCorrectionLine={changeCorrectionLine}
                  onRemoveCorrection={removeCorrection}
                  onReviewNoteChange={(value) => {
                    setReviewNote(value);
                    setDirty(true);
                    setMessage(null);
                  }}
                  onSaveDraft={() => void saveDraft()}
                  onConfirmDraft={(revision) => void confirmDraft(revision)}
                />
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
