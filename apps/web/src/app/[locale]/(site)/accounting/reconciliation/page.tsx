'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type { AccountingUberFinancialReport } from '../contracts/automation-period';

export default function AccountingReconciliationPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const [reports, setReports] = useState<AccountingUberFinancialReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    void apiFetch<AccountingUberFinancialReport[]>(
      '/accounting/automation/uber-reports?limit=100',
    )
      .then(setReports)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{isZh ? '对账中心' : 'Reconciliation'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '这里保留 Uber 官方 Report 的请求与原始 CSV 归档状态。平台财务凭证、标准化明细与正式结算对账统一在“平台结算”中处理。'
            : 'This page retains Uber report request and raw CSV archive status. Provider financial evidence, normalized lines, and settlement reconciliation are handled in Provider settlements.'}
        </p>
      </div>

      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Uber Eats Reports</h2>
          <span className="text-xs text-slate-500">eats.report</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-2 py-2">{isZh ? '期间' : 'Range'}</th>
                <th className="px-2 py-2">{isZh ? '类型' : 'Type'}</th>
                <th className="px-2 py-2">{isZh ? '状态' : 'Status'}</th>
                <th className="px-2 py-2">{isZh ? '原始文件' : 'Raw files'}</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.reportStableId} className="border-b last:border-0">
                  <td className="px-2 py-2">
                    {report.startDate} — {report.endDate}
                  </td>
                  <td className="px-2 py-2">{report.reportType}</td>
                  <td className="px-2 py-2">
                    {report.status}
                    {report.errorMessage ? (
                      <p className="mt-1 max-w-md text-xs text-red-600">{report.errorMessage}</p>
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
                      ? '尚无 Uber Report。开启 eats.report scope 后，夜间任务会自动开始请求。'
                      : 'No Uber reports yet. Nightly requests begin once eats.report is enabled.'}
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
