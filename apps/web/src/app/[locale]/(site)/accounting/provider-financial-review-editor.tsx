import type {
  AccountingProviderFinancialDocument,
  AccountingProviderFinancialReviewRevision,
} from './contracts/provider-financial';
import {
  ACCOUNTING_FINANCIAL_COMPONENT_OPTIONS,
  ACCOUNTING_POSTING_TREATMENT_OPTIONS,
  ACCOUNTING_TAX_ROLE_OPTIONS,
  formatCad,
  type ProviderFinancialReviewDraftRow,
} from './provider-financial-review-model';

type Props = {
  document: AccountingProviderFinancialDocument;
  rows: ProviderFinancialReviewDraftRow[];
  reviewNote: string;
  isZh: boolean;
  saving: boolean;
  dirty: boolean;
  draftReview: AccountingProviderFinancialReviewRevision | null;
  confirmingId: string | null;
  onAddCorrection: () => void;
  onUpdateRow: (
    sourceLineStableId: string,
    update: Partial<ProviderFinancialReviewDraftRow>,
  ) => void;
  onChangeCorrectionLine: (
    currentSourceLineStableId: string,
    nextSourceLineStableId: string,
  ) => void;
  onRemoveCorrection: (sourceLineStableId: string) => void;
  onReviewNoteChange: (value: string) => void;
  onSaveDraft: () => void;
  onConfirmDraft: (
    revision: AccountingProviderFinancialReviewRevision,
  ) => void;
};

export function ProviderFinancialReviewEditor({
  document,
  rows,
  reviewNote,
  isZh,
  saving,
  dirty,
  draftReview,
  confirmingId,
  onAddCorrection,
  onUpdateRow,
  onChangeCorrectionLine,
  onRemoveCorrection,
  onReviewNoteChange,
  onSaveDraft,
  onConfirmDraft,
}: Props) {
  const usedLineStableIds = new Set(rows.map((row) => row.sourceLineStableId));
  const availableLines = document.lines.filter(
    (line) => !usedLineStableIds.has(line.lineStableId),
  );

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">
            {isZh ? '编辑复核草稿' : 'Edit review draft'}
          </h4>
          <p className="text-xs text-slate-500">
            {isZh
              ? '保存草稿不会影响结算；只有明确确认后的 revision 才会成为有效值。'
              : 'Saving a draft does not affect settlement; only an explicitly confirmed revision becomes effective.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddCorrection}
          disabled={availableLines.length === 0}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {isZh ? '添加修正' : 'Add correction'}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {isZh
            ? '当前没有修正行；如果你刚移除了旧修正，保存后会生成零修正 revision 并恢复机器值。'
            : 'There are no correction rows. If you just removed prior corrections, saving creates a zero-correction revision that restores the machine values.'}
        </p>
      ) : null}

      {rows.map((row) => {
        const sourceLine = document.lines.find(
          (line) => line.lineStableId === row.sourceLineStableId,
        );
        if (!sourceLine) return null;
        const lineChoices = document.lines.filter(
          (line) =>
            line.lineStableId === row.sourceLineStableId ||
            !usedLineStableIds.has(line.lineStableId),
        );
        return (
          <div
            key={row.sourceLineStableId}
            className="space-y-3 rounded-lg border border-slate-200 p-3"
          >
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid min-w-[220px] flex-1 gap-1 text-xs">
                <span className="text-slate-500">
                  {isZh ? '源行' : 'Source line'}
                </span>
                <select
                  value={row.sourceLineStableId}
                  onChange={(event) =>
                    onChangeCorrectionLine(
                      row.sourceLineStableId,
                      event.target.value,
                    )
                  }
                  className="rounded border border-slate-300 bg-white px-2 py-2 text-sm"
                >
                  {lineChoices.map((line) => (
                    <option key={line.lineStableId} value={line.lineStableId}>
                      #{line.lineNo} {line.rawName ?? line.component} ·{' '}
                      {formatCad(line.amountCents)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-[220px] gap-1 text-xs">
                <span className="text-slate-500">
                  {isZh ? '修正类型' : 'Correction type'}
                </span>
                <select
                  value={row.reason}
                  onChange={(event) =>
                    onUpdateRow(row.sourceLineStableId, {
                      reason: event.target
                        .value as ProviderFinancialReviewDraftRow['reason'],
                    })
                  }
                  className="rounded border border-slate-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="EXTRACTION_CORRECTION">
                    EXTRACTION_CORRECTION
                  </option>
                  <option value="SEMANTIC_CLASSIFICATION">
                    SEMANTIC_CLASSIFICATION
                  </option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => onRemoveCorrection(row.sourceLineStableId)}
                className="rounded border border-red-200 px-3 py-2 text-xs text-red-700"
              >
                {isZh ? '移除' : 'Remove'}
              </button>
            </div>

            {row.reason === 'EXTRACTION_CORRECTION' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs">
                  <span className="text-slate-500">
                    {isZh ? '有效标签' : 'Effective label'}
                  </span>
                  <input
                    value={row.rawName}
                    onChange={(event) =>
                      onUpdateRow(row.sourceLineStableId, {
                        rawName: event.target.value,
                      })
                    }
                    className="rounded border border-slate-300 px-2 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="text-slate-500">
                    {isZh ? '有效金额（CAD）' : 'Effective amount (CAD)'}
                  </span>
                  <input
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(event) =>
                      onUpdateRow(row.sourceLineStableId, {
                        amount: event.target.value,
                      })
                    }
                    className="rounded border border-slate-300 px-2 py-2 text-sm"
                  />
                </label>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs">
                  <span className="text-slate-500">Component</span>
                  <select
                    value={row.component}
                    onChange={(event) =>
                      onUpdateRow(row.sourceLineStableId, {
                        component: event.target
                          .value as ProviderFinancialReviewDraftRow['component'],
                      })
                    }
                    className="rounded border border-slate-300 bg-white px-2 py-2 text-sm"
                  >
                    {ACCOUNTING_FINANCIAL_COMPONENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="text-slate-500">Posting treatment</span>
                  <select
                    value={row.postingTreatment}
                    onChange={(event) =>
                      onUpdateRow(row.sourceLineStableId, {
                        postingTreatment: event.target
                          .value as ProviderFinancialReviewDraftRow['postingTreatment'],
                      })
                    }
                    className="rounded border border-slate-300 bg-white px-2 py-2 text-sm"
                  >
                    {ACCOUNTING_POSTING_TREATMENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="text-slate-500">Tax role</span>
                  <select
                    value={row.taxRole}
                    onChange={(event) =>
                      onUpdateRow(row.sourceLineStableId, {
                        taxRole: event.target
                          .value as ProviderFinancialReviewDraftRow['taxRole'],
                      })
                    }
                    className="rounded border border-slate-300 bg-white px-2 py-2 text-sm"
                  >
                    {ACCOUNTING_TAX_ROLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <label className="grid gap-1 text-xs">
              <span className="text-slate-500">
                {row.reason === 'SEMANTIC_CLASSIFICATION'
                  ? isZh
                    ? '说明（必填）'
                    : 'Review note (required)'
                  : isZh
                    ? '说明'
                    : 'Review note'}
              </span>
              <textarea
                value={row.note}
                onChange={(event) =>
                  onUpdateRow(row.sourceLineStableId, {
                    note: event.target.value,
                  })
                }
                rows={2}
                className="rounded border border-slate-300 px-2 py-2 text-sm"
              />
            </label>
          </div>
        );
      })}

      <label className="grid gap-1 text-xs">
        <span className="text-slate-500">
          {isZh ? '本次复核备注' : 'Revision note'}
        </span>
        <textarea
          value={reviewNote}
          onChange={(event) => onReviewNoteChange(event.target.value)}
          rows={2}
          className="rounded border border-slate-300 px-2 py-2 text-sm"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saving || !dirty}
          className="rounded bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving
            ? isZh
              ? '保存中…'
              : 'Saving…'
            : isZh
              ? '保存新草稿'
              : 'Save new draft'}
        </button>
        {draftReview ? (
          <button
            type="button"
            onClick={() => onConfirmDraft(draftReview)}
            disabled={
              dirty ||
              confirmingId === draftReview.reviewRevisionStableId
            }
            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 disabled:opacity-50"
          >
            {confirmingId === draftReview.reviewRevisionStableId
              ? isZh
                ? '确认中…'
                : 'Confirming…'
              : isZh
                ? '确认草稿 v' + draftReview.revision
                : 'Confirm draft v' + draftReview.revision}
          </button>
        ) : null}
        {dirty && draftReview ? (
          <span className="text-xs text-amber-700">
            {isZh
              ? '当前有未保存修改；先保存新草稿再确认。'
              : 'Unsaved changes exist; save a new draft before confirming.'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
