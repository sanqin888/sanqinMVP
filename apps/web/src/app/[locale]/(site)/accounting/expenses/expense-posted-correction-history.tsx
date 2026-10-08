'use client';

import type {
  ExpensePostedCorrectionPreview,
  ExpensePostedCorrectionRecord,
} from '../contracts/expenses';

const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

function statusClass(status: string): string {
  if (status === 'POSTED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'READY') return 'bg-amber-100 text-amber-900';
  if (status === 'CANCELLED') return 'bg-slate-200 text-slate-700';
  return 'bg-blue-100 text-blue-800';
}

export function ExpenseCorrectionPreview({
  preview,
  isZh,
}: {
  preview: ExpensePostedCorrectionPreview;
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
    <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-950">
            {isZh
              ? 'Correction Preview / 补偿差额'
              : 'Correction Preview / Compensating delta'}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {isZh
              ? '这里只展示将追加的 compensating delta；这不是新的完整 Journal，也不会修改原始 Journal。'
              : 'This is only the compensating delta that would be appended. It is not a replacement full Journal and never modifies the original Journal.'}
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

      {preview.deltaPosting.lines.length ? (
        <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
          <table className="min-w-[620px] w-full text-left text-xs">
            <thead className="border-b bg-amber-50 text-slate-500">
              <tr>
                <th className="px-3 py-2">{isZh ? '科目' : 'Account'}</th>
                <th className="px-3 py-2">{isZh ? '分类' : 'Category'}</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.deltaPosting.lines.map((line) => (
                <tr
                  key={`${line.accountStableId}:${line.categoryStableId ?? ''}`}
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
            ? 'NOOP / authority-only：当前 Preview 没有需要追加的财务差额 Journal。'
            : 'NOOP / authority-only: this Preview has no financial delta Journal to append.'}
        </p>
      )}

      <div className="rounded-lg bg-slate-950 p-3 text-xs text-slate-200">
        <p className="font-semibold text-white">planHash</p>
        <p className="mt-1 break-all font-mono leading-5">{preview.planHash}</p>
      </div>
    </section>
  );
}

export function ExpenseCorrectionAuthoritySummary({
  record,
  isZh,
}: {
  record: ExpensePostedCorrectionRecord;
  isZh: boolean;
}) {
  const current = record.currentEffective?.draftInput;
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">
          {isZh ? 'Original persisted fact' : 'Original persisted fact'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {isZh
            ? '已确认 Expense source row 的原始持久化事实保持不可变。'
            : 'The confirmed Expense source row remains immutable.'}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-slate-500">{isZh ? '总额' : 'Total'}</dt>
            <dd className="font-semibold">
              {money(record.originalPersisted.totalCents)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{isZh ? '税' : 'Tax'}</dt>
            <dd className="font-semibold">
              {money(record.originalPersisted.taxCents)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-slate-500">{isZh ? '备注' : 'Memo'}</dt>
            <dd>{record.originalPersisted.memo || '—'}</dd>
          </div>
        </dl>
        <div className="mt-3 space-y-1 text-xs">
          {record.originalPersisted.splits.map((split) => (
            <p key={split.splitStableId}>
              {split.categoryName} · {money(split.amountCents)} + tax{' '}
              {money(split.taxCents)}
              {record.document.fundingAttributionVersion === 2
                ? ` · ${split.paidFromAccountName ?? 'unresolved'}`
                : ''}
            </p>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-blue-950">
              {isZh
                ? 'Current Effective corrected authority'
                : 'Current Effective corrected authority'}
            </p>
            <p className="mt-1 text-xs text-blue-800">
              {isZh
                ? 'Original + 所有已 POSTED Corrections 后的当前业务 authority；主列表尚未切到这个 projection。'
                : 'Current business authority after Original + all POSTED Corrections. The main Expense list is not cut over to this projection yet.'}
            </p>
          </div>
          {record.currentEffective ? (
            <span className="rounded bg-white px-2 py-1 font-mono text-[10px] text-blue-800">
              {record.currentEffective.targetAuthorityHash.slice(0, 12)}…
            </span>
          ) : null}
        </div>
        {current ? (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-blue-700">{isZh ? '总额' : 'Total'}</dt>
                <dd className="font-semibold">{money(current.totalCents)}</dd>
              </div>
              <div>
                <dt className="text-blue-700">
                  {isZh ? 'Funding 版本' : 'Funding version'}
                </dt>
                <dd className="font-semibold">
                  v{record.document.fundingAttributionVersion}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-blue-700">{isZh ? '备注' : 'Memo'}</dt>
                <dd>{current.memo || '—'}</dd>
              </div>
            </dl>
            <div className="mt-3 space-y-1 text-xs">
              {current.splits.map((split) => (
                <p key={split.splitStableId}>
                  {split.categoryStableId} · {money(split.amountCents)} + tax{' '}
                  {money(split.taxCents)}
                  {record.document.fundingAttributionVersion === 2
                    ? ` · ${split.paidFromAccountStableId ?? 'unresolved'}`
                    : ''}
                </p>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-xs text-red-700">{record.blockReason}</p>
        )}
      </section>
    </div>
  );
}

export function ExpenseCorrectionHistory({
  record,
  isZh,
}: {
  record: ExpensePostedCorrectionRecord;
  isZh: boolean;
}) {
  return (
    <section className="space-y-2">
      <p className="text-sm font-semibold text-slate-900">
        {isZh ? 'Correction 历史' : 'Correction history'}
      </p>
      {record.corrections.length ? (
        [...record.corrections].reverse().map((correction) => (
          <details
            key={correction.correctionStableId}
            className="rounded-lg border border-slate-200 bg-white p-3 text-xs"
          >
            <summary className="cursor-pointer list-none">
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
                  <span>{correction.reasonCode}</span>
                </div>
                <span className="text-slate-500">
                  {new Date(correction.createdAt).toLocaleString(
                    isZh ? 'zh-CN' : 'en-CA',
                  )}
                </span>
              </div>
            </summary>

            <div className="mt-3 space-y-3 border-t pt-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <p>
                  Revision: <strong>{correction.revisions.length}</strong>
                </p>
                <p>
                  {isZh ? '创建者：' : 'Created by: '}
                  <span className="font-mono">
                    {correction.createdByActorRef}
                  </span>
                </p>
                <p>
                  {isZh ? '策略：' : 'Strategy: '}
                  {correction.strategy ?? '—'}
                </p>
                <p>
                  {isZh ? 'POST 时间：' : 'Posted at: '}
                  {correction.postedAt
                    ? new Date(correction.postedAt).toLocaleString(
                        isZh ? 'zh-CN' : 'en-CA',
                      )
                    : '—'}
                </p>
                <p>
                  {isZh ? 'POST 操作者：' : 'Posted by: '}
                  <span className="font-mono">
                    {correction.postedByActorRef ?? '—'}
                  </span>
                </p>
                <p>
                  {isZh ? '输出 Journal：' : 'Journal outputs: '}
                  {correction.journalOutputs.length}
                </p>
              </div>
              {correction.note ? (
                <p className="rounded bg-slate-50 px-2 py-1.5 text-slate-600">
                  {correction.note}
                </p>
              ) : null}

              {correction.revisions.length ? (
                <div className="space-y-1">
                  <p className="font-semibold text-slate-700">
                    {isZh ? 'Authority revisions' : 'Authority revisions'}
                  </p>
                  {correction.revisions.map((revision) => (
                    <p key={revision.correctionRevisionStableId}>
                      #{revision.revision} ·{' '}
                      <span className="font-mono">
                        {revision.targetAuthorityHash.slice(0, 16)}…
                      </span>{' '}
                      · {revision.createdByActorRef}
                    </p>
                  ))}
                </div>
              ) : null}

              {correction.journalOutputs.map((output) => (
                <div
                  key={output.outputStableId}
                  className="rounded border border-slate-200 p-2"
                >
                  <p className="font-semibold">
                    {output.role} #{output.sequence} ·{' '}
                    <span className="font-mono">
                      {output.journal.entryStableId}
                    </span>
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-[560px] w-full text-left">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="py-1">{isZh ? '科目' : 'Account'}</th>
                          <th className="py-1">{isZh ? '分类' : 'Category'}</th>
                          <th className="py-1 text-right">Debit</th>
                          <th className="py-1 text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {output.journal.lines.map((line) => (
                          <tr key={line.lineNo}>
                            <td className="py-1">{line.accountName}</td>
                            <td className="py-1">
                              {line.categoryName ?? line.categoryStableId ?? '—'}
                            </td>
                            <td className="py-1 text-right">
                              {line.debitCents ? money(line.debitCents) : '—'}
                            </td>
                            <td className="py-1 text-right">
                              {line.creditCents ? money(line.creditCents) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))
      ) : (
        <p className="text-xs text-slate-500">
          {isZh
            ? '尚无 Posted Correction 历史。'
            : 'No posted-correction history yet.'}
        </p>
      )}
    </section>
  );
}
