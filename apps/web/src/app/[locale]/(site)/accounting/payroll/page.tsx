'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { PayrollRunPanel } from './payroll-run-panel';
import { PayrollSetupPanel } from './payroll-setup-panel';
import { PayrollCraRemittancePanel } from './payroll-cra-remittance-panel';
import {
  payrollMoney,
  type PayrollEmployee,
  type PayrollEmployeeConfig,
  type PayrollEmployer,
  type PayrollEmployerConfig,
  type PayrollRun,
} from './payroll-types';
import { PayrollYearOpeningPanel } from './payroll-year-opening-panel';

type PayrollView = 'runs' | 'employees' | 'cra';

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
  const [activeView, setActiveView] = useState<PayrollView>('runs');
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

  const refreshPayrollPage = useCallback(() => {
    setError(null);
    void refreshPayrollState().catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [refreshPayrollState]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        {isZh ? '正在加载工资系统…' : 'Loading Payroll…'}
      </div>
    );
  }

  const selectedEmployer =
    employers.find(
      (item) => item.employerStableId === selectedEmployerStableId,
    ) ?? null;
  const selectedEmployee =
    employees.find(
      (item) => item.employeeStableId === selectedEmployeeStableId,
    ) ?? null;
  const currentEmployerConfig = employerConfigs[0] ?? null;
  const currentEmployeeConfig = employeeConfigs[0] ?? null;

  const views: Array<{
    key: PayrollView;
    zh: string;
    en: string;
  }> = [
    { key: 'runs', zh: '工资记录', en: 'Runs' },
    { key: 'employees', zh: '员工与设置', en: 'Employees' },
    { key: 'cra', zh: 'CRA 汇款', en: 'CRA' },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isZh ? '工资 Payroll' : 'Payroll'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {isZh
              ? '高频工资录入、员工法定配置和 CRA 汇款分开操作。工资计算、应计、付款和汇款事实仍全部由后端冻结并留证。'
              : 'Frequent payroll entry, employee statutory setup and CRA remittance are separated by workflow. Calculations, accruals, payments and remittances remain server-owned and frozen as evidence.'}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshPayrollPage}
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

      <div
        data-payroll-context
        className="sticky top-0 z-20 space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:p-4"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-500">
            {isZh ? '当前雇主' : 'Employer'}
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              value={selectedEmployerStableId}
              onChange={(event) => {
                setSelectedEmployerStableId(event.target.value);
                setSelectedEmployeeStableId('');
                setSelectedRunStableId('');
              }}
            >
              <option value="">
                {isZh ? '选择雇主' : 'Select employer'}
              </option>
              {employers.map((item) => (
                <option
                  key={item.employerStableId}
                  value={item.employerStableId}
                >
                  {item.displayName ?? item.legalName}
                </option>
              ))}
            </select>
            <span className="mt-1 block truncate text-[11px] font-normal text-slate-400">
              {selectedEmployer
                ? currentEmployerConfig
                  ? (selectedEmployer.displayName ?? selectedEmployer.legalName) +
                    ' · ' +
                    currentEmployerConfig.remitterType +
                    ' · EI x' +
                    (
                      currentEmployerConfig.eiEmployerMultiplierMicros /
                      1_000_000
                    ).toFixed(2)
                  : selectedEmployer.displayName ?? selectedEmployer.legalName
                : '—'}
            </span>
          </label>

          <label className="text-xs font-medium text-slate-500">
            {activeView === 'cra'
              ? isZh
                ? '当前员工（CRA 不按员工操作）'
                : 'Employee (not used by CRA)'
              : isZh
                ? '当前员工'
                : 'Employee'}
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
              value={selectedEmployeeStableId}
              onChange={(event) => {
                setSelectedEmployeeStableId(event.target.value);
                setSelectedRunStableId('');
              }}
              disabled={!selectedEmployerStableId || activeView === 'cra'}
            >
              <option value="">
                {isZh ? '选择员工' : 'Select employee'}
              </option>
              {employees.map((item) => (
                <option
                  key={item.employeeStableId}
                  value={item.employeeStableId}
                >
                  {item.displayName ?? item.legalName}
                </option>
              ))}
            </select>
            <span className="mt-1 block truncate text-[11px] font-normal text-slate-400">
              {activeView === 'cra'
                ? isZh
                  ? 'CRA 汇款按雇主与 remittance period 汇总。'
                  : 'CRA remittance is employer/period scoped.'
                : selectedEmployee
                  ? currentEmployeeConfig
                    ? (selectedEmployee.displayName ??
                        selectedEmployee.legalName) +
                      ' · ' +
                      currentEmployeeConfig.payFrequency +
                      ' · ' +
                      payrollMoney(
                        currentEmployeeConfig.defaultHourlyRateCents,
                      ) +
                      '/h'
                    : selectedEmployee.displayName ??
                      selectedEmployee.legalName
                  : '—'}
            </span>
          </label>
        </div>

        <div
          role="tablist"
          aria-label={isZh ? 'Payroll 工作区' : 'Payroll workspace'}
          className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
        >
          {views.map((view) => {
            const active = activeView === view.key;
            return (
              <button
                key={view.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-payroll-view={view.key}
                onClick={() => setActiveView(view.key)}
                className={
                  'rounded-lg px-3 py-2 text-sm font-medium transition ' +
                  (active
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900')
                }
              >
                {isZh ? view.zh : view.en}
              </button>
            );
          })}
        </div>
      </div>

      {activeView === 'runs' ? (
        <div data-payroll-workspace="runs" className="space-y-4">
          {selectedEmployeeStableId ? (
            <PayrollRunPanel
              isZh={isZh}
              employeeStableId={selectedEmployeeStableId}
              employeeConfigs={employeeConfigs}
              runs={runs}
              selectedRunStableId={selectedRunStableId}
              onRunSelect={setSelectedRunStableId}
              onChanged={refreshPayrollState}
            />
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {isZh
                ? '先在上方选择员工，再创建或查看工资记录。未选择员工时不会显示工资录入表单。'
                : 'Select an employee above before creating or reviewing payroll runs. Payroll entry stays hidden until an employee is selected.'}
            </p>
          )}
        </div>
      ) : null}

      {activeView === 'employees' ? (
        <div data-payroll-workspace="employees" className="space-y-5">
          <PayrollSetupPanel
            isZh={isZh}
            employers={employers}
            employerConfigs={employerConfigs}
            employees={employees}
            employeeConfigs={employeeConfigs}
            selectedEmployerStableId={selectedEmployerStableId}
            selectedEmployeeStableId={selectedEmployeeStableId}
            onEmployeeSelect={(value) => {
              setSelectedEmployeeStableId(value);
              setSelectedRunStableId('');
            }}
            onChanged={refreshPayrollState}
          />

          <PayrollYearOpeningPanel
            isZh={isZh}
            employeeStableId={selectedEmployeeStableId}
          />
        </div>
      ) : null}

      {activeView === 'cra' ? (
        <div data-payroll-workspace="cra">
          <PayrollCraRemittancePanel
            isZh={isZh}
            employerStableId={selectedEmployerStableId}
          />
        </div>
      ) : null}
    </div>
  );
}
