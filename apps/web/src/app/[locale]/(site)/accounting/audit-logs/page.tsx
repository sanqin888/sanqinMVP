'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  operatorUserId: string;
  createdAt: string;
};

export default function AccountingAuditLogsPage() {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [entityType, setEntityType] = useState('');

  const load = async (nextEntityType?: string) => {
    const query = nextEntityType ? `?entityType=${encodeURIComponent(nextEntityType)}` : '';
    const data = await apiFetch<AuditLog[]>(`/accounting/audit-logs${query}`);
    setRows(data);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">审计日志</h1>
        <div className="flex gap-2">
          <input className="rounded border px-3 py-2" placeholder="entityType，如 ACCOUNTING_TRANSACTION" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
          <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={() => void load(entityType.trim())}>查询</button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-2 py-2">时间</th>
                <th className="px-2 py-2">动作</th>
                <th className="px-2 py-2">实体类型</th>
                <th className="px-2 py-2">实体 ID</th>
                <th className="px-2 py-2">操作人</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-2 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-2">{row.action}</td>
                  <td className="px-2 py-2">{row.entityType}</td>
                  <td className="px-2 py-2">{row.entityId}</td>
                  <td className="px-2 py-2">{row.operatorUserId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
