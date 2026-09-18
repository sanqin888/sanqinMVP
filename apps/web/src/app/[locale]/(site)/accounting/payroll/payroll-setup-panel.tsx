'use client';

import { FormEvent, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import {
  payrollLocalDateToday,
  payrollMoney,
  type PayrollEmployee,
  type PayrollEmployeeConfig,
  type PayrollEmployer,
  type PayrollEmployerConfig,
} from './payroll-types';
import {
  PayrollEmployeeConfigForm,
  PayrollEmployerConfigForm,
} from './payroll-config-forms';

type Props = {
  isZh: boolean;
  employers: PayrollEmployer[];
  employerConfigs: PayrollEmployerConfig[];
  employees: PayrollEmployee[];
  employeeConfigs: PayrollEmployeeConfig[];
  selectedEmployerStableId: string;
  selectedEmployeeStableId: string;
  onEmployerSelect: (value: string) => void;
  onEmployeeSelect: (value: string) => void;
  onChanged: () => Promise<void>;
};

export function PayrollSetupPanel({
  isZh,
  employers,
  employerConfigs,
  employees,
  employeeConfigs,
  selectedEmployerStableId,
  selectedEmployeeStableId,
  onEmployerSelect,
  onEmployeeSelect,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employerName, setEmployerName] = useState('SanQ Roujiamo');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeDisplayName, setEmployeeDisplayName] = useState('');
  const [employeeStart, setEmployeeStart] = useState(payrollLocalDateToday());
  const [storeStableId, setStoreStableId] = useState('4750_Yonge_Street');

  const selectedEmployer = useMemo(
    () =>
      employers.find(
        (item) => item.employerStableId === selectedEmployerStableId,
      ) ?? null,
    [employers, selectedEmployerStableId],
  );
  const selectedEmployee = useMemo(
    () =>
      employees.find(
        (item) => item.employeeStableId === selectedEmployeeStableId,
      ) ?? null,
    [employees, selectedEmployeeStableId],
  );
  const currentEmployerConfig = employerConfigs[0] ?? null;
  const currentEmployeeConfig = employeeConfigs[0] ?? null;

  async function submit(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function createEmployer(event: FormEvent) {
    event.preventDefault();
    void submit(() =>
      apiFetch('/accounting/payroll/employers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName: employerName,
          displayName: employerName,
          defaultStoreStableId: storeStableId || null,
        }),
      }),
    );
  }

  function createEmployee(event: FormEvent) {
    event.preventDefault();
    if (!selectedEmployerStableId) return;
    void submit(() =>
      apiFetch(
        '/accounting/payroll/employers/' +
          encodeURIComponent(selectedEmployerStableId) +
          '/employees',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            legalName: employeeName,
            displayName: employeeDisplayName || null,
            storeStableId: storeStableId || null,
            employmentStartDate: employeeStart,
          }),
        },
      ),
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">
          {isZh ? '工资设置' : 'Payroll setup'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '雇主、员工和 effective-dated 法定工资配置。所有 reviewed facts 都显式保存，浏览器不计算税。'
            : 'Employer, employee and effective-dated statutory payroll configuration. Reviewed facts are explicit; no tax is calculated in the browser.'}
        </p>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold">{isZh ? '雇主' : 'Employer'}</h3>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={selectedEmployerStableId}
            onChange={(event) => onEmployerSelect(event.target.value)}
          >
            <option value="">{isZh ? '选择雇主' : 'Select employer'}</option>
            {employers.map((item) => (
              <option key={item.employerStableId} value={item.employerStableId}>
                {item.displayName ?? item.legalName}
              </option>
            ))}
          </select>

          {selectedEmployer ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium">
                {selectedEmployer.displayName ?? selectedEmployer.legalName}
              </p>
              <p className="mt-1 text-slate-500">
                {currentEmployerConfig
                  ? (isZh ? '当前配置 v' : 'Current config v') +
                    currentEmployerConfig.version +
                    ' · ' +
                    currentEmployerConfig.remitterType +
                    ' · EI x' +
                    (
                      currentEmployerConfig.eiEmployerMultiplierMicros /
                      1_000_000
                    ).toFixed(2)
                  : isZh
                    ? '还没有雇主配置'
                    : 'No employer config yet'}
              </p>
            </div>
          ) : null}

          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {isZh ? '新增雇主' : 'Add employer'}
            </summary>
            <form className="mt-3 space-y-2" onSubmit={createEmployer}>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={employerName}
                onChange={(event) => setEmployerName(event.target.value)}
                placeholder={isZh ? '雇主法定名称' : 'Employer legal name'}
                required
              />
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={storeStableId}
                onChange={(event) => setStoreStableId(event.target.value)}
                placeholder="storeStableId"
              />
              <button
                disabled={busy}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isZh ? '创建雇主' : 'Create employer'}
              </button>
            </form>
          </details>

          {selectedEmployerStableId ? (
            <PayrollEmployerConfigForm
              isZh={isZh}
              employerStableId={selectedEmployerStableId}
              onChanged={onChanged}
            />
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold">{isZh ? '员工' : 'Employee'}</h3>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={selectedEmployeeStableId}
            onChange={(event) => onEmployeeSelect(event.target.value)}
            disabled={!selectedEmployerStableId}
          >
            <option value="">{isZh ? '选择员工' : 'Select employee'}</option>
            {employees.map((item) => (
              <option key={item.employeeStableId} value={item.employeeStableId}>
                {item.displayName ?? item.legalName}
              </option>
            ))}
          </select>

          {selectedEmployee ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium">
                {selectedEmployee.displayName ?? selectedEmployee.legalName}
              </p>
              <p className="mt-1 text-slate-500">
                {currentEmployeeConfig
                  ? currentEmployeeConfig.payFrequency +
                    ' · ' +
                    payrollMoney(currentEmployeeConfig.defaultHourlyRateCents) +
                    '/h · vacation ' +
                    (
                      currentEmployeeConfig.vacationRateBasisPoints / 100
                    ).toFixed(2) +
                    '%'
                  : isZh
                    ? '还没有员工工资配置'
                    : 'No employee payroll config yet'}
              </p>
            </div>
          ) : null}

          {selectedEmployerStableId ? (
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {isZh ? '新增员工' : 'Add employee'}
              </summary>
              <form
                className="mt-3 grid gap-2 sm:grid-cols-2"
                onSubmit={createEmployee}
              >
                <input
                  className="rounded-lg border px-3 py-2"
                  value={employeeName}
                  onChange={(event) => setEmployeeName(event.target.value)}
                  placeholder={isZh ? '员工法定姓名' : 'Employee legal name'}
                  required
                />
                <input
                  className="rounded-lg border px-3 py-2"
                  value={employeeDisplayName}
                  onChange={(event) => setEmployeeDisplayName(event.target.value)}
                  placeholder={
                    isZh ? '显示姓名（可选）' : 'Display name (optional)'
                  }
                />
                <label className="text-xs text-slate-500">
                  {isZh ? '入职日' : 'Employment start'}
                  <input
                    type="date"
                    className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
                    value={employeeStart}
                    onChange={(event) => setEmployeeStart(event.target.value)}
                  />
                </label>
                <button
                  disabled={busy}
                  className="self-end rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {isZh ? '新增员工' : 'Add employee'}
                </button>
              </form>
            </details>
          ) : null}

          {selectedEmployeeStableId ? (
            <PayrollEmployeeConfigForm
              isZh={isZh}
              employeeStableId={selectedEmployeeStableId}
              onChanged={onChanged}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
