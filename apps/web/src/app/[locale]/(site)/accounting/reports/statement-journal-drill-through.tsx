'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type {
  AccountingStatementDrillThroughPhase,
  AccountingStatementJournalDrillThrough,
} from '../contracts/reports';
import { resolveAccountingSourceFactNavigation } from './source-fact-navigation';

const PAGE_SIZE = 25;

const money = (cents: number) =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

function phaseLabel(
  phase: AccountingStatementDrillThroughPhase,
  isZh: boolean,
) {
  if (phase === 'OPENING') return isZh ? '期初' : 'Opening';
  if (phase === 'PERIOD') return isZh ? '本期' : 'Period';
  return isZh ? '期末累计' : 'Closing cumulative';
}

function formatOccurredAt(
  value: string,
  timezone: string,
  isZh: boolean,
): string {
  return new Intl.DateTimeFormat(isZh ? 'zh-CA' : 'en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function SourceFactIdentity({
  sourceFactType,
  sourceFactStableId,
  isZh,
}: {
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  isZh: boolean;
}) {
  if (!sourceFactType || !sourceFactStableId) {
    return (
      <p className="mt-1 break-all text-xs text-slate-500">
        {isZh ? '无 source fact identity' : 'No source fact identity'}
      </p>
    );
  }

  const navigation = resolveAccountingSourceFactNavigation({
    locale: isZh ? 'zh' : 'en',
    sourceFactType,
    sourceFactStableId,
  });

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="break-all text-slate-500">
        {sourceFactType} · {sourceFactStableId}
      </span>
      {navigation ? (
        <Link
          className="font-medium text-blue-700 underline decoration-dashed underline-offset-2"
          href={navigation.href}
        >
          {isZh ? '打开来源' : 'Open source'}
        </Link>
      ) : null}
    </div>
  );
}

export function StatementJournalDrillThrough({
  accountStableId,
  accountName,
  phase,
  from,
  to,
  currency,
  isZh,
  onClose,
}: {
  accountStableId: string;
  accountName: string;
  phase: AccountingStatementDrillThroughPhase;
  from: string;
  to: string;
  currency: string;
  isZh: boolean;
  onClose: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [report, setReport] =
    useState<AccountingStatementJournalDrillThrough | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOffset(0);
  }, [accountStableId, phase, from, to, currency]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({
      accountStableId,
      phase,
      from,
      to,
      currency,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    }).toString();

    void apiFetch<AccountingStatementJournalDrillThrough>(
      `/accounting/report/statement-journals?${query}`,
    )
      .then((next) => {
        if (!cancelled) setReport(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountStableId, currency, from, offset, phase, to]);

  const title = useMemo(
    () =>
      `${accountName} · ${phaseLabel(phase, isZh)} · ${from} — ${to}`,
    [accountName, from, isZh, phase, to],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25"
      role="dialog"
      aria-modal="true"
    >
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                {isZh ? 'Journal 穿透明细' : 'Journal drill-through'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{title}</p>
            </div>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm"
              onClick={onClose}
            >
              {isZh ? '关闭' : 'Close'}
            </button>
          </div>
          {report ? (
            <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
              <span>
                {isZh ? '本页借方' : 'Page account debits'}:{' '}
                {money(report.pageSummary.accountDebitCents)}
              </span>
              <span>
                {isZh ? '本页贷方' : 'Page account credits'}:{' '}
                {money(report.pageSummary.accountCreditCents)}
              </span>
              <span>
                {isZh ? '本页正常方向净变动' : 'Page normal-side movement'}:{' '}
                {money(report.pageSummary.accountNormalMovementCents)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 p-5">
          {error ? (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {loading ? (
            <p className="text-sm text-slate-500">
              {isZh ? '正在读取 Journal…' : 'Loading Journals…'}
            </p>
          ) : null}

          {report?.entries.map((entry) => (
            <details
              key={entry.entryStableId}
              className="rounded-xl border border-slate-200 bg-white"
            >
              <summary className="cursor-pointer list-none px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {entry.memo || entry.entryStableId}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatOccurredAt(
                        entry.occurredAt,
                        report.timezone,
                        isZh,
                      )}{' '}
                      · {entry.kind} · {entry.source}
                    </p>
                    <SourceFactIdentity
                      sourceFactType={entry.sourceFactType}
                      sourceFactStableId={entry.sourceFactStableId}
                      isZh={isZh}
                    />
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <div>
                      {isZh ? '账户借' : 'Dr'} {money(entry.accountDebitCents)}
                    </div>
                    <div>
                      {isZh ? '账户贷' : 'Cr'} {money(entry.accountCreditCents)}
                    </div>
                  </div>
                </div>
              </summary>
              <div className="border-t border-slate-100 px-4 py-3">
                <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-500">
                  <span>
                    {isZh ? '分录借方' : 'Entry debits'}{' '}
                    {money(entry.entryDebitCents)}
                  </span>
                  <span>
                    {isZh ? '分录贷方' : 'Entry credits'}{' '}
                    {money(entry.entryCreditCents)}
                  </span>
                  {entry.storeStableId ? <span>{entry.storeStableId}</span> : null}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[680px] w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">
                          {isZh ? '账户' : 'Account'}
                        </th>
                        <th className="px-3 py-2 text-left">
                          {isZh ? '分类' : 'Category'}
                        </th>
                        <th className="px-3 py-2 text-right">
                          {isZh ? '借方' : 'Debit'}
                        </th>
                        <th className="px-3 py-2 text-right">
                          {isZh ? '贷方' : 'Credit'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.lines.map((line) => {
                        const highlighted = entry.highlightedLineNos.includes(
                          line.lineNo,
                        );
                        return (
                          <tr
                            key={line.lineNo}
                            className={
                              highlighted
                                ? 'border-t border-slate-100 bg-amber-50'
                                : 'border-t border-slate-100'
                            }
                          >
                            <td className="px-3 py-2">{line.lineNo}</td>
                            <td className="px-3 py-2">
                              <div>{line.accountName}</div>
                              <div className="text-xs text-slate-500">
                                {line.accountStableId}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">
                              {line.categoryName || '—'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {line.debitCents ? money(line.debitCents) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {line.creditCents ? money(line.creditCents) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          ))}

          {report && !report.entries.length && !loading ? (
            <p className="rounded bg-slate-50 px-3 py-4 text-sm text-slate-500">
              {isZh ? '这个区间没有 Journal。' : 'No Journals in this scope.'}
            </p>
          ) : null}

          {report ? (
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-500">
                {report.pagination.total} {isZh ? '条分录' : 'entries'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  {isZh ? '上一页' : 'Previous'}
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
                  disabled={!report.pagination.hasMore || loading}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  {isZh ? '下一页' : 'Next'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
