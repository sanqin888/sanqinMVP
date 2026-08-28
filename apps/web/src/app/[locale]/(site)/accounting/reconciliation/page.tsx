'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';

type UberReport = {
  reportStableId: string;
  workflowId: string;
  reportType: string;
  startDate: string;
  endDate: string;
  status: 'REQUESTED' | 'READY' | 'IMPORTED' | 'ERROR';
  artifactUrls: string[];
  requestedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
};

type Reconciliation = {
  settlementCount: number;
  diffCount: number;
  diffs: Array<{ type: string; orderId: string | null; message: string }>;
};

export default function AccountingReconciliationPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [reports, setReports] = useState<UberReport[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    void Promise.all([
      apiFetch<UberReport[]>('/accounting/automation/uber-reports?limit=100'),
      apiFetch<Reconciliation>(`/accounting/reconciliation/platform/UBER_EATS?from=${from}&to=${to}`),
    ])
      .then(([nextReports, nextReconciliation]) => {
        setReports(nextReports);
        setReconciliation(nextReconciliation);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [from, to]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{isZh ? '对账中心' : 'Reconciliation'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? 'Uber 官方 Report 每天凌晨请求。原始 CSV 会保留；结算数据进入标准化解析后再与订单收入核对。'
            : 'Official Uber reports are requested nightly. Raw CSV artifacts are retained before normalized settlement reconciliation.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-4">
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded border px-3 py-2 text-sm" />
        <span className="self-center text-slate-400">→</span>
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded border px-3 py-2 text-sm" />
      </div>
      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Uber Eats Reports</h2>
          <span className="text-xs text-slate-500">eats.report</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">{isZh ? '期间' : 'Range'}</th><th className="px-2 py-2">{isZh ? '类型' : 'Type'}</th><th className="px-2 py-2">{isZh ? '状态' : 'Status'}</th><th className="px-2 py-2">{isZh ? '原始文件' : 'Raw files'}</th></tr></thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.reportStableId} className="border-b last:border-0">
                  <td className="px-2 py-2">{report.startDate} — {report.endDate}</td>
                  <td className="px-2 py-2">{report.reportType}</td>
                  <td className="px-2 py-2">{report.status}{report.errorMessage ? <p className="mt-1 max-w-md text-xs text-red-600">{report.errorMessage}</p> : null}</td>
                  <td className="px-2 py-2">{report.artifactUrls.length ? report.artifactUrls.map((url, index) => <a key={url} className="mr-2 text-blue-600 hover:underline" href={url} target="_blank" rel="noreferrer">CSV {index + 1}</a>) : '-'}</td>
                </tr>
              ))}
              {!reports.length ? <tr><td className="px-2 py-5 text-slate-500" colSpan={4}>{isZh ? '尚无 Uber Report。开启 eats.report scope 后，夜间任务会自动开始请求。' : 'No Uber reports yet. Nightly requests begin once eats.report is enabled.'}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-4"><p className="text-sm text-slate-500">{isZh ? '已标准化结算记录' : 'Normalized settlement records'}</p><p className="mt-1 text-2xl font-semibold">{reconciliation?.settlementCount ?? 0}</p></div>
          <div className="rounded-lg bg-slate-50 p-4"><p className="text-sm text-slate-500">{isZh ? '对账差异' : 'Differences'}</p><p className={`mt-1 text-2xl font-semibold ${(reconciliation?.diffCount ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{reconciliation?.diffCount ?? 0}</p></div>
        </div>
        <div className="mt-4 divide-y text-sm">
          {(reconciliation?.diffs ?? []).map((diff, index) => <div key={`${diff.orderId ?? 'none'}-${index}`} className="py-3"><p className="font-medium">{diff.type} {diff.orderId ? `· ${diff.orderId}` : ''}</p><p className="mt-1 text-slate-600">{diff.message}</p></div>)}
        </div>
        <p className="mt-4 text-xs text-slate-500">{isZh ? '注意：Uber 官方 CSV 列会随国家/版本增加；原始文件先保留，标准化解析必须按表头名容忍新增列，不能依赖固定列序。' : 'Uber may add CSV columns. Raw reports are retained and normalized parsers must key by header name rather than column position.'}</p>
      </section>
    </div>
  );
}
