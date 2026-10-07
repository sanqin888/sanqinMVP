'use client';

import type { AccountingAccount, AccountingCategory } from '../contracts/chart';
import type {
  AccountingExpenseDocument,
  ExpensePostedCorrectionReasonCode,
} from '../contracts/expenses';
import { ExpensePostedCorrectionEditor } from './expense-posted-correction-editor';
import {
  ExpenseCorrectionAuthoritySummary,
  ExpenseCorrectionHistory,
  ExpenseCorrectionPreview,
} from './expense-posted-correction-history';
import {
  EXPENSE_CORRECTION_REASONS,
  useExpensePostedCorrectionWorkflow,
} from './expense-posted-correction-workflow';

type Props = {
  document: AccountingExpenseDocument;
  categories: AccountingCategory[];
  accounts: AccountingAccount[];
  isZh: boolean;
  onClose: () => void;
  onRecordChanged: () => Promise<void> | void;
};

export function ExpensePostedCorrectionPanel({
  document,
  categories,
  accounts,
  isZh,
  onClose,
  onRecordChanged,
}: Props) {
  const workflow = useExpensePostedCorrectionWorkflow({
    document,
    isZh,
    onRecordChanged,
  });
  const {
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
  } = workflow;

  const busy = loading || saving || previewing || transitioning || posting;
  const editorDisabled = active?.status === 'READY' || postUnknown;
  const postReady =
    active?.status === 'READY' &&
    Boolean(active.planHash) &&
    confirmationText.trim() === active.planHash &&
    acknowledged &&
    !postUnknown;

  return (
    <section
      id="expense-correction-panel"
      className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/30 p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-violet-950">
            {isZh ? '已入账支出修正' : 'Correct posted Expense record'}
          </h2>
          <p className="mt-1 text-xs text-violet-800">
            {isZh
              ? '独立 Correction 工作流；confirmed Expense source row 与原始 Journal 始终保持不可变。'
              : 'A separate Correction workflow; the confirmed Expense source row and original Journal remain immutable.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="rounded border bg-white px-2.5 py-1.5 text-xs disabled:opacity-50"
          >
            {isZh ? '刷新 authority' : 'Refresh authority'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={posting}
            className="rounded border bg-white px-2.5 py-1.5 text-xs disabled:opacity-50"
          >
            {isZh ? '关闭' : 'Close'}
          </button>
        </div>
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

      {loading ? (
        <p className="text-sm text-slate-500">
          {isZh ? '加载 Correction authority…' : 'Loading correction authority…'}
        </p>
      ) : record ? (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <p>
              <strong>{isZh ? '冻结字段：' : 'Frozen fields: '}</strong>
              occurredAt {record.document.occurredAt ?? '—'} · currency{' '}
              {record.document.currency} · funding attribution v
              {record.document.fundingAttributionVersion}
            </p>
            <p className="mt-1 text-slate-500">
              {isZh
                ? 'source posting authority 由 C1 owner adapter 冻结；UI 不提供编辑入口。'
                : 'Source posting authority is frozen by the C1 owner adapter and is not editable here.'}
            </p>
          </div>

          <ExpenseCorrectionAuthoritySummary record={record} isZh={isZh} />

          {record.status === 'BLOCKED' || !record.currentEffective ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-900">
                Correction BLOCKED
              </p>
              <p className="mt-1 text-xs text-red-700">{record.blockReason}</p>
            </div>
          ) : (
            <section className="space-y-4 rounded-xl border border-violet-200 bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs">
                  <span className="text-slate-600">
                    {isZh ? '原因' : 'Reason'}
                  </span>
                  <select
                    value={reasonCode}
                    disabled={editorDisabled}
                    onChange={(event) => {
                      setReasonCode(
                        event.target.value as ExpensePostedCorrectionReasonCode,
                      );
                      markDirty();
                    }}
                    className="mt-1 w-full rounded border bg-white px-2 py-2"
                  >
                    {EXPENSE_CORRECTION_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="text-slate-600">
                    {isZh ? '说明' : 'Note'}
                  </span>
                  <input
                    value={note}
                    disabled={editorDisabled}
                    onChange={(event) => {
                      setNote(event.target.value);
                      markDirty();
                    }}
                    maxLength={2000}
                    className="mt-1 w-full rounded border px-2 py-2"
                  />
                </label>
              </div>

              <ExpensePostedCorrectionEditor
                isZh={isZh}
                fundingVersion={record.document.fundingAttributionVersion}
                totalText={totalText}
                memo={memo}
                splits={splits}
                allocations={allocations}
                categories={categories}
                accounts={accounts}
                disabled={editorDisabled}
                onTotalTextChange={setTotalText}
                onMemoChange={setMemo}
                onSplitsChange={setSplits}
                onAllocationsChange={setAllocations}
                onAllocationTouched={() => setAllocationsTouched(true)}
                onDirty={markDirty}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={!dirty || busy || postUnknown}
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
                        ? '创建 Correction DRAFT'
                        : 'Create correction DRAFT'}
                </button>
                {active?.status === 'DRAFT' ? (
                  <button
                    type="button"
                    onClick={() => void buildPreview()}
                    disabled={dirty || busy || postUnknown}
                    className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    {previewing
                      ? isZh
                        ? 'Preview 中…'
                        : 'Previewing…'
                      : 'Preview'}
                  </button>
                ) : null}
                {active ? (
                  <button
                    type="button"
                    onClick={() => void cancelCorrection()}
                    disabled={busy || postUnknown}
                    className="rounded border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                  >
                    {isZh ? '取消 Correction' : 'Cancel correction'}
                  </button>
                ) : null}
              </div>
            </section>
          )}

          {readyPreview ? (
            <ExpenseCorrectionPreview preview={readyPreview} isZh={isZh} />
          ) : null}

          {active?.status === 'DRAFT' &&
          preview?.status === 'READY' &&
          !dirty ? (
            <button
              type="button"
              onClick={() => void markReady()}
              disabled={busy || postUnknown}
              className="rounded bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isZh
                ? '确认 Preview 并冻结为 READY'
                : 'Confirm Preview and mark READY'}
            </button>
          ) : null}

          {active?.status === 'READY' && active.planHash ? (
            <section className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-950">
                {isZh ? '最终 POST 授权闸门' : 'Final POST authorization gate'}
              </p>
              <p className="text-xs leading-5 text-red-800">
                {isZh
                  ? '只追加 immutable Correction Journal；请输入完整 planHash 并确认。POST 后必须以 fresh authoritative record 证明结果。'
                  : 'Only immutable Correction Journals are appended. Enter the full planHash and acknowledge. The result must be proven by a fresh authoritative read.'}
              </p>
              <p className="break-all rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-200">
                {active.planHash}
              </p>
              <input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                disabled={postUnknown}
                placeholder={isZh ? '输入完整 planHash' : 'Enter full planHash'}
                className="w-full rounded border border-red-300 bg-white px-3 py-2 font-mono text-xs"
              />
              <label className="flex items-start gap-2 text-xs text-red-900">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={postUnknown}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  {isZh
                    ? '我确认已核对 Current Effective、补偿 Delta 和完整 planHash，并理解这不是 Undo。'
                    : 'I reviewed Current Effective, the compensating Delta, and the full planHash, and understand this is not an Undo.'}
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
                    ? 'POST 并 fresh-read 复核中…'
                    : 'Posting and fresh-read verifying…'
                  : 'POST Correction'}
              </button>
            </section>
          ) : null}

          <ExpenseCorrectionHistory record={record} isZh={isZh} />
        </>
      ) : null}
    </section>
  );
}
