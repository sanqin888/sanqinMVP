'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import {
  accountingBusinessDateToday,
  accountingReportPresetRange,
  type AccountingReportPreset,
} from '@/lib/accounting-reporting-date';
import type {
  AccountingCashflowReport,
  AccountingPnlReport,
  AccountingReportGroupBy,
} from '@/lib/contracts/accounting-management';
import { ManagementPnlReportView } from './ManagementPnlReportView';

function defaultReportRange() {
  return accountingReportPresetRange('year', accountingBusinessDateToday());
}

function ManagementExportLinks({
  from,
  to,
  groupBy,
  isZh,
}: {
  from: string;
  to: string;
  groupBy: AccountingReportGroupBy;
  isZh: boolean;
}) {
  const query = new URLSearchParams({
    template: 'MANAGEMENT',
    from,
    to,
    groupBy,
  }).toString();

  return (
    <div className="flex flex-wrap gap-2">
      <a
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300"
        href={`/api/v1/accounting/export/report.pdf?${query}`}
        target="_blank"
        rel="noreferrer"
      >
        {isZh ? '管理版 PDF' : 'Management PDF'}
      </a>
      <a
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300"
        href={`/api/v1/accounting/export/report.csv?${query}`}
        target="_blank"
        rel="noreferrer"
      >
        CSV
      </a>
    </div>
  );
}

export function ManagementPnlPageClient() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const initialRange = defaultReportRange();
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [groupBy, setGroupBy] = useState<AccountingReportGroupBy>('month');
  const [report, setReport] = useState<AccountingPnlReport | null>(null);
  const [cashflow, setCashflow] = useState<AccountingCashflowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReport(null);
    setCashflow(null);

    const load = async () => {
      const [nextReport, nextCashflow] = await Promise.all([
        apiFetch<AccountingPnlReport>(
          `/accounting/report/pnl?from=${from}&to=${to}&groupBy=${groupBy}`,
        ),
        apiFetch<AccountingCashflowReport>(
          `/accounting/report/cashflow?from=${from}&to=${to}`,
        ),
      ]);
      if (cancelled) return;
      setReport(nextReport);
      setCashflow(nextCashflow);
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
  }, [from, groupBy, to]);

  function setPreset(preset: AccountingReportPreset) {
    const range = accountingReportPresetRange(
      preset,
      accountingBusinessDateToday(),
    );
    setFrom(range.from);
    setTo(range.to);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isZh ? '管理损益' : 'Management P&L'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {isZh
              ? '全业务 / 全账本管理视图。金额与 Cash Movement 均直接来自 Accounting owner contracts；本页面不使用当前门店作为 P&L 范围。'
              : 'Whole-business / whole-ledger management view. Amounts and Cash Movement come directly from Accounting owner contracts; the current Store is not a P&L scope.'}
          </p>
        </div>
        <ManagementExportLinks
          from={from}
          to={to}
          groupBy={groupBy}
          isZh={isZh}
        />
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300"
            onClick={() => setPreset('month')}
          >
            {isZh ? '本月' : 'This month'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300"
            onClick={() => setPreset('lastMonth')}
          >
            {isZh ? '上月' : 'Last month'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300"
            onClick={() => setPreset('quarter')}
          >
            {isZh ? '本季度' : 'This quarter'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300"
            onClick={() => setPreset('year')}
          >
            {isZh ? '今年' : 'This year'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="grid gap-1 text-xs font-medium text-slate-500">
            <span>{isZh ? '开始日期' : 'From'}</span>
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <span className="self-end pb-2 text-slate-400">→</span>
          <label className="grid gap-1 text-xs font-medium text-slate-500">
            <span>{isZh ? '结束日期' : 'To'}</span>
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-500">
            <span>{isZh ? '分组' : 'Group by'}</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              value={groupBy}
              onChange={(event) =>
                setGroupBy(event.target.value as AccountingReportGroupBy)
              }
            >
              <option value="month">{isZh ? '按月' : 'Monthly'}</option>
              <option value="quarter">{isZh ? '按季度' : 'Quarterly'}</option>
              <option value="year">{isZh ? '按年' : 'Yearly'}</option>
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          {isZh ? '正在读取管理报表…' : 'Loading management reports…'}
        </p>
      ) : null}

      {report && cashflow ? (
        <ManagementPnlReportView
          report={report}
          cashflow={cashflow}
          isZh={isZh}
        />
      ) : null}
    </div>
  );
}
