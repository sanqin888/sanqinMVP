import { uberApiFetch } from '../api/uberAdminApi';
import { ResourceStatus } from '../dashboard/ResourceStatus';
import type { RunAction } from '../hooks/useUberMutationState';
import type { ReconciliationReport, ResourceState } from '../types';
export function ReconciliationPanel({ reports, resource, retry, runAction }: { reports: ReconciliationReport[]; resource: ResourceState; retry: () => void; runAction: RunAction }) {
  return <section aria-label="reconciliation-reports"><div className="rounded-xl border bg-white p-4"><h3 className="text-lg font-semibold">Reconciliation Reports</h3><ResourceStatus state={resource} retry={retry} /><button type="button" className="mt-2 rounded border px-3 py-1 text-sm" onClick={() => void runAction('gen-report', () => uberApiFetch('/integrations/ubereats/v2/reports/reconciliation/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then(() => {}), '已生成对账报告')}>生成对账报告</button><div className="mt-3 space-y-2 text-sm">{reports.map((report) => <div key={report.reportStableId} className="rounded border p-2"><p>{report.reportStableId}</p><p>totalOrders: {report.totalOrders} / amount: {report.totalAmountCents}</p></div>)}</div></div></section>;
}
