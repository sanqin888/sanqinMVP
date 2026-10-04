'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import {
  accountingBusinessDateToday,
  accountingReportPresetRange,
  type AccountingReportPreset,
} from '../accounting-reporting-date';
import type {
  AccountingBalanceMovementReport,
  AccountingTrialBalanceReport,
} from '../contracts/reports';
import {
  BalanceMovementStatement,
  TrialBalanceStatement,
  type StatementDrillTarget,
} from './accounting-statements';
import { StatementJournalDrillThrough } from './statement-journal-drill-through';

type ReportView = 'trialBalance' | 'balanceMovement';

function defaultReportRange() {
  return accountingReportPresetRange('year', accountingBusinessDateToday());
}

export default function AccountingReportsPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const initialRange = defaultReportRange();
  const [view, setView] = useState<ReportView>('trialBalance');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [trialBalance, setTrialBalance] =
    useState<AccountingTrialBalanceReport | null>(null);
  const [balanceMovement, setBalanceMovement] =
    useState<AccountingBalanceMovementReport | null>(null);
  const [drillTarget, setDrillTarget] = useState<StatementDrillTarget | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    if (view === 'trialBalance') {
      setTrialBalance(null);
    } else {
      setBalanceMovement(null);
    }

    const load = async () => {
      const query = new URLSearchParams({ from, to }).toString();
      if (view === 'trialBalance') {
        const nextTrialBalance = await apiFetch<AccountingTrialBalanceReport>(
          `/accounting/report/trial-balance?${query}`,
        );
        if (!cancelled) setTrialBalance(nextTrialBalance);
        return;
      }

      const nextBalanceMovement =
        await apiFetch<AccountingBalanceMovementReport>(
          `/accounting/report/balance-movement?${query}`,
        );
      if (!cancelled) setBalanceMovement(nextBalanceMovement);
    };

    void load()
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
  }, [from, to, view]);

  const statementExportQuery = new URLSearchParams({ from, to }).toString();

  function setPreset(preset: AccountingReportPreset) {
    const range = accountingReportPresetRange(
      preset,
      accountingBusinessDateToday(),
    );
    setDrillTarget(null);
    setFrom(range.from);
    setTo(range.to);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isZh ? '会计报表' : 'Accounting Statements'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {isZh
              ? '这里保留 canonical Journal statement authority：试算平衡与资产负债变动表。经营管理分析已归入 Admin Data。'
              : 'This surface keeps canonical Journal statement authority: Trial Balance and Balance Movement. Management analysis now belongs in Admin Data.'}
          </p>
        </div>
        <ExportLinks
          view={view}
          statementQuery={statementExportQuery}
          isZh={isZh}
        />
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <ViewButton
            active={view === 'trialBalance'}
            onClick={() => {
              setDrillTarget(null);
              setView('trialBalance');
            }}
          >
            {isZh ? '试算平衡' : 'Trial Balance'}
          </ViewButton>
          <ViewButton
            active={view === 'balanceMovement'}
            onClick={() => {
              setDrillTarget(null);
              setView('balanceMovement');
            }}
          >
            {isZh ? '资产负债变动表' : 'Balance Movement'}
          </ViewButton>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <button
            className="rounded border px-3 py-1.5"
            onClick={() => setPreset('month')}
          >
            {isZh ? '本月' : 'This month'}
          </button>
          <button
            className="rounded border px-3 py-1.5"
            onClick={() => setPreset('lastMonth')}
          >
            {isZh ? '上月' : 'Last month'}
          </button>
          <button
            className="rounded border px-3 py-1.5"
            onClick={() => setPreset('quarter')}
          >
            {isZh ? '本季度' : 'This quarter'}
          </button>
          <button
            className="rounded border px-3 py-1.5"
            onClick={() => setPreset('year')}
          >
            {isZh ? '今年' : 'This year'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            className="rounded border px-3 py-2"
            value={from}
            onChange={(event) => {
              setDrillTarget(null);
              setFrom(event.target.value);
            }}
          />
          <span className="self-center text-slate-400">→</span>
          <input
            type="date"
            className="rounded border px-3 py-2"
            value={to}
            onChange={(event) => {
              setDrillTarget(null);
              setTo(event.target.value);
            }}
          />
        </div>
      </section>

      {error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {isZh ? '正在读取会计报表…' : 'Loading accounting statements…'}
        </p>
      ) : null}

      {view === 'trialBalance' && trialBalance ? (
        <TrialBalanceStatement
          report={trialBalance}
          isZh={isZh}
          onDrillThrough={setDrillTarget}
        />
      ) : null}

      {view === 'balanceMovement' && balanceMovement ? (
        <BalanceMovementStatement
          report={balanceMovement}
          isZh={isZh}
          onDrillThrough={setDrillTarget}
        />
      ) : null}

      {drillTarget ? (
        <StatementJournalDrillThrough
          accountStableId={drillTarget.accountStableId}
          accountName={drillTarget.accountName}
          phase={drillTarget.phase}
          from={from}
          to={to}
          currency={
            view === 'trialBalance'
              ? trialBalance?.currency ?? 'CAD'
              : balanceMovement?.currency ?? 'CAD'
          }
          isZh={isZh}
          onClose={() => setDrillTarget(null)}
        />
      ) : null}
    </div>
  );
}

function ExportLinks({
  view,
  statementQuery,
  isZh,
}: {
  view: ReportView;
  statementQuery: string;
  isZh: boolean;
}) {
  const base =
    view === 'trialBalance'
      ? '/api/v1/accounting/export/trial-balance'
      : '/api/v1/accounting/export/balance-movement';
  const query = statementQuery;

  return (
    <div className="flex flex-wrap gap-2">
      <a
        className="rounded border bg-white px-3 py-2 text-sm"
        href={`${base}.pdf?${query}`}
        target="_blank"
        rel="noreferrer"
      >
        PDF
      </a>
      <a
        className="rounded border bg-white px-3 py-2 text-sm"
        href={`${base}.csv?${query}`}
        target="_blank"
        rel="noreferrer"
      >
        CSV
      </a>
      <span className="sr-only">
        {isZh ? '导出当前会计报表' : 'Export current accounting statement'}
      </span>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'rounded-lg bg-[#87362E] px-3 py-2 text-sm font-semibold text-white'
          : 'rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600'
      }
    >
      {children}
    </button>
  );
}
