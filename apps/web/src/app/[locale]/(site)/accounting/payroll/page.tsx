'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { PayrollRunPanel } from './payroll-run-panel';
import { PayrollSetupPanel } from './payroll-setup-panel';
import { PayrollCraRemittancePanel } from './payroll-cra-remittance-panel';
import {
  type PayrollEmployee,
  type PayrollEmployeeConfig,
  type PayrollEmployer,
  type PayrollEmployerConfig,
  type PayrollRun,
} from './payroll-types';
import { PayrollYearOpeningPanel } from './payroll-year-opening-panel';

export default function AccountingPayrollPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';

  const [employers, setEmployers] = useState<PayrollEmployer[]>([]);
  const [employerConfigs, setEmployerConfigs] = useState<
    PayrollEmployerConfig[]
  >([]);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [employeeConfigs, setEmployeeConfigs] = useState<
    PayrollEmployeeConfig[]
  >([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedEmployerStableId, setSelectedEmployerStableId] = useState('');
  const [selectedEmployeeStableId, setSelectedEmployeeStableId] = useState('');
  const [selectedRunStableId, setSelectedRunStableId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEmployers = useCallback(async () => {
    const next = await apiFetch<PayrollEmployer[]>(
      '/accounting/payroll/employers?includeInactive=true',
    );
    setEmployers(next);
    setSelectedEmployerStableId((current) =>
      next.some((item) => item.employerStableId === current)
        ? current
        : (next.find((item) => item.isActive) ?? next[0])?.employerStableId ??
          '',
    );
  }, []);

  const loadEmployerScope = useCallback(async (employerStableId: string) => {
    if (!employerStableId) {
      setEmployerConfigs([]);
      setEmployees([]);
      setSelectedEmployeeStableId('');
      return;
    }

    const encoded = encodeURIComponent(employerStableId);
    const [nextConfigs, nextEmployees] = await Promise.all([
      apiFetch<PayrollEmployerConfig[]>(
        '/accounting/payroll/employers/' + encoded + '/configs',
      ),
      apiFetch<PayrollEmployee[]>(
        '/accounting/payroll/employers/' +
          encoded +
          '/employees?includeInactive=true',
      ),
    ]);
    setEmployerConfigs(nextConfigs);
    setEmployees(nextEmployees);
    setSelectedEmployeeStableId((current) =>
      nextEmployees.some((item) => item.employeeStableId === current)
        ? current
        : (
            nextEmployees.find((item) => item.isActive) ?? nextEmployees[0]
          )?.employeeStableId ?? '',
    );
  }, []);

  const loadEmployeeScope = useCallback(async (employeeStableId: string) => {
    if (!employeeStableId) {
      setEmployeeConfigs([]);
      setRuns([]);
      setSelectedRunStableId('');
      return;
    }

    const encoded = encodeURIComponent(employeeStableId);
    const [nextConfigs, nextRuns] = await Promise.all([
      apiFetch<PayrollEmployeeConfig[]>(
        '/accounting/payroll/employees/' + encoded + '/configs',
      ),
      apiFetch<PayrollRun[]>(
        '/accounting/payroll/runs?employeeStableId=' + encoded,
      ),
    ]);
    setEmployeeConfigs(nextConfigs);
    setRuns(nextRuns);
    setSelectedRunStableId((current) =>
      nextRuns.some((item) => item.runStableId === current)
        ? current
        : nextRuns[0]?.runStableId ?? '',
    );
  }, []);

  const refreshAll = useCallback(async () => {
    setError(null);
    await loadEmployers();
  }, [loadEmployers]);

  useEffect(() => {
    setLoading(true);
    void loadEmployers()
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setLoading(false));
  }, [loadEmployers]);

  useEffect(() => {
    setError(null);
    void loadEmployerScope(selectedEmployerStableId).catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [loadEmployerScope, selectedEmployerStableId]);

  useEffect(() => {
    setError(null);
    void loadEmployeeScope(selectedEmployeeStableId).catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [loadEmployeeScope, selectedEmployeeStableId]);

  const refreshPayrollState = useCallback(async () => {
    await loadEmployers();
    if (selectedEmployerStableId) {
      await loadEmployerScope(selectedEmployerStableId);
    }
    if (selectedEmployeeStableId) {
      await loadEmployeeScope(selectedEmployeeStableId);
    }
  }, [
    loadEmployeeScope,
    loadEmployerScope,
    loadEmployers,
    selectedEmployeeStableId,
    selectedEmployerStableId,
  ]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        {isZh ? '正在加载工资系统…' : 'Loading Payroll…'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isZh ? '工资 Payroll' : 'Payroll'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {isZh
              ? 'Ontario hourly payroll：配置、年中 YTD、工资计算、审批、工资应计入账和工资单。法定计算全部由后端冻结并留证。'
              : 'Ontario hourly payroll: configuration, mid-year YTD, calculation, approval, payroll accrual posting and pay statements. Statutory calculations remain server-owned and frozen as evidence.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
        >
          {isZh ? '刷新' : 'Refresh'}
        </button>
      </header>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {isZh
          ? '当前 Payroll 已支持工资应计入账、员工净工资付款和 CRA 工资代扣/供款汇款。员工付款与 CRA 汇款只清除各自应付负债，不会重写工资费用；已入账工资冲销仍属于后续 8P-D4。'
          : 'Payroll now supports accrual posting, employee net-pay settlement and CRA payroll remittance. Employee and CRA settlements clear only their respective liabilities without rewriting payroll expense; posted-run reversal remains in 8P-D4.'}
      </div>

      <PayrollSetupPanel
        isZh={isZh}
        employers={employers}
        employerConfigs={employerConfigs}
        employees={employees}
        employeeConfigs={employeeConfigs}
        selectedEmployerStableId={selectedEmployerStableId}
        selectedEmployeeStableId={selectedEmployeeStableId}
        onEmployerSelect={(value) => {
          setSelectedEmployerStableId(value);
          setSelectedEmployeeStableId('');
          setSelectedRunStableId('');
        }}
        onEmployeeSelect={(value) => {
          setSelectedEmployeeStableId(value);
          setSelectedRunStableId('');
        }}
        onChanged={refreshPayrollState}
      />

      <PayrollCraRemittancePanel
        isZh={isZh}
        employerStableId={selectedEmployerStableId}
      />

      <PayrollYearOpeningPanel
        isZh={isZh}
        employeeStableId={selectedEmployeeStableId}
      />

      <PayrollRunPanel
        isZh={isZh}
        employeeStableId={selectedEmployeeStableId}
        employeeConfigs={employeeConfigs}
        runs={runs}
        selectedRunStableId={selectedRunStableId}
        onRunSelect={setSelectedRunStableId}
        onChanged={refreshPayrollState}
      />
    </div>
  );
}
