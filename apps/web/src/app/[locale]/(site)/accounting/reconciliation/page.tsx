'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type {
  AccountingUberFinancialReport,
  AccountingUberFinancialReportRequest,
  AccountingUberFinancialReportRequestResult,
  AccountingUberFinancialReportType,
} from '../contracts/automation-period';

const FINANCIAL_REPORT_TYPES: AccountingUberFinancialReportType[] = [
  'PAYMENT_DETAILS_REPORT',
  'FINANCE_SUMMARY_REPORT',
];

export default function AccountingReconciliationPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const [reports, setReports] = useState<AccountingUberFinancialReport[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportTypes, setReportTypes] =
    useState<AccountingUberFinancialReportType[]>(FINANCIAL_REPORT_TYPES);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    const rows = await apiFetch<AccountingUberFinancialReport[]>(
      '/accounting/automation/uber-reports?limit=100',
    );
    setReports(rows);
  }, []);

  useEffect(() => {
    setError(null);
    void loadReports().catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [loadReports]);

  function toggleReportType(
    reportType: AccountingUberFinancialReportType,
    checked: boolean,
  ) {
    setReportTypes((current) =>
      checked
        ? Array.from(new Set([...current, reportType]))
        : current.filter((value) => value !== reportType),
    );
  }

  async function requestReports() {
    setError(null);
    setMessage(null);
    if (!startDate || !endDate) {
      setError(
        isZh
          ? '请选择报表开始和结束日期。'
          : 'Select report start and end dates.',
      );
      return;
    }
    if (!reportTypes.length) {
      setError(isZh ? '至少选择一种报表。' : 'Select at least one report type.');
      return;
    }

    setBusy(true);
    try {
      const body: AccountingUberFinancialReportRequest = {
        startDate,
        endDate,
        reportTypes,
      };
      const requested = await apiFetch<
        AccountingUberFinancialReportRequestResult[]
      >('/accounting/automation/uber-reports/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setMessage(
        isZh
          ? `已提交 ${requested.length} 个 Uber Report 请求；完成后状态会变为 READY 并出现原始 CSV。`
          : `Submitted ${requested.length} Uber report request(s). Completed reports become READY with raw CSV files.`,
      );
      await loadReports();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function refreshReports() {
    setBusy(true);
    setError(null);
    try {
      await loadReports();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {isZh ? '对账中心' : 'Reconciliation'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '这里保留 Uber 官方 Report 的请求与原始 CSV 归档状态。平台财务凭证、标准化明细与正式结算对账统一在“平台结算”中处理。'
            : 'This page retains Uber report request and raw CSV archive status. Provider financial evidence, normalized lines, and settlement reconciliation are handled in Provider settlements.'}
        </p>
      </div>

      {message ? (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">
            {isZh ? '手动请求 Uber 财务报表' : 'Request Uber financial reports'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? '用于 eats.report 验证和受控补采。这里只允许 Accounting 使用的 Payment Details 与 Finance Summary；不会触发 Gmail 或其它夜间采集任务。'
              : 'For eats.report validation and controlled backfill. Only Accounting Payment Details and Finance Summary are allowed; this does not run Gmail or other nightly intake jobs.'}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-4 text-sm">
          <label>
            {isZh ? '开始日期' : 'Start date'}
            <input
              type="date"
              className="mt-1 block rounded border px-3 py-2"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label>
            {isZh ? '结束日期' : 'End date'}
            <input
              type="date"
              className="mt-1 block rounded border px-3 py-2"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          {FINANCIAL_REPORT_TYPES.map((reportType) => (
            <label key={reportType} className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                checked={reportTypes.includes(reportType)}
                onChange={(event) =>
                  toggleReportType(reportType, event.target.checked)
                }
              />
              {reportType}
            </label>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void requestReports()}
            className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {isZh ? '请求报表' : 'Request reports'}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Uber Eats Reports</h2>
            <span className="text-xs text-slate-500">eats.report</span>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void refreshReports()}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {isZh ? '刷新状态' : 'Refresh'}
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-2 py-2">{isZh ? '期间' : 'Range'}</th>
                <th className="px-2 py-2">{isZh ? '类型' : 'Type'}</th>
                <th className="px-2 py-2">{isZh ? '状态' : 'Status'}</th>
                <th className="px-2 py-2">
                  {isZh ? '原始文件' : 'Raw files'}
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr
                  key={report.reportStableId}
                  className="border-b last:border-0"
                >
                  <td className="px-2 py-2">
                    {report.startDate} — {report.endDate}
                  </td>
                  <td className="px-2 py-2">{report.reportType}</td>
                  <td className="px-2 py-2">
                    {report.status}
                    {report.errorMessage ? (
                      <p className="mt-1 max-w-md text-xs text-red-600">
                        {report.errorMessage}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    {report.artifactUrls.length
                      ? report.artifactUrls.map((url, index) => (
                          <a
                            key={url}
                            className="mr-2 text-blue-600 hover:underline"
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            CSV {index + 1}
                          </a>
                        ))
                      : '-'}
                  </td>
                </tr>
              ))}
              {!reports.length ? (
                <tr>
                  <td className="px-2 py-5 text-slate-500" colSpan={4}>
                    {isZh
                      ? '尚无 Uber Report。现在可以在上方按日期手动请求，或等待夜间任务。'
                      : 'No Uber reports yet. Request one above by date or wait for the nightly job.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
