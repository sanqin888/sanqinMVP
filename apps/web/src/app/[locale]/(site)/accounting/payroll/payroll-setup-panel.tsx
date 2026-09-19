'use client';

import { FormEvent, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type {
  PayrollEmployee,
  PayrollEmployeeConfig,
  PayrollEmployer,
  PayrollEmployerConfig,
} from '../contracts/payroll';
import { payrollLocalDateToday, payrollMoney } from './payroll-ui';
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

  async function submit<T>(action: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      await onChanged();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
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

    void (async () => {
      const created = await submit(() =>
        apiFetch<PayrollEmployee>(
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
      if (!created) return;

      onEmployeeSelect(created.employeeStableId);
      setEmployeeName('');
      setEmployeeDisplayName('');
    })();
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">
          {isZh ? '员工与工资设置' : 'Employees & payroll setup'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '这里只维护低频的雇主、员工和 effective-dated 法定配置。当前生效事实先以摘要显示，需要新增版本时再主动展开表单。'
            : 'Use this workspace for low-frequency employer, employee and effective-dated statutory setup. Current facts stay summarized until you intentionally open a new-version form.'}
        </p>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div>
            <h3 className="font-semibold">{isZh ? '雇主设置' : 'Employer setup'}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {isZh
                ? '当前雇主由页面顶部选择。CRA remitter 与 EI multiplier 只在这里维护。'
                : 'The employer is selected in the sticky context above. Maintain CRA remitter and EI multiplier only here.'}
            </p>
          </div>

          {selectedEmployer ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium">
                {selectedEmployer.displayName ?? selectedEmployer.legalName}
              </p>
              {currentEmployerConfig ? (
                <div className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                  <span>
                    {isZh ? '当前配置' : 'Current config'} v
                    {currentEmployerConfig.version}
                  </span>
                  <span>
                    {isZh ? '生效日' : 'Effective'}:{' '}
                    {currentEmployerConfig.effectiveFrom}
                  </span>
                  <span>
                    CRA: {currentEmployerConfig.remitterType}
                  </span>
                  <span>
                    EI x
                    {(
                      currentEmployerConfig.eiEmployerMultiplierMicros /
                      1_000_000
                    ).toFixed(2)}
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-slate-500">
                  {isZh ? '还没有雇主配置' : 'No employer config yet'}
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {isZh ? '先在顶部选择雇主。' : 'Select an employer above first.'}
            </p>
          )}

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
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {isZh
                  ? '新增雇主法定配置版本'
                  : 'Add employer statutory config version'}
              </summary>
              <div className="mt-3">
                <PayrollEmployerConfigForm
                  isZh={isZh}
                  employerStableId={selectedEmployerStableId}
                  onChanged={onChanged}
                />
              </div>
            </details>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div>
            <h3 className="font-semibold">{isZh ? '员工设置' : 'Employee setup'}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {isZh
                ? '当前员工由页面顶部选择。工资频率、时薪、TD1、CPP、EI 和 Vacation 只在这里维护。'
                : 'The employee is selected in the sticky context above. Maintain frequency, rate, TD1, CPP, EI and Vacation only here.'}
            </p>
          </div>

          {selectedEmployee ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium">
                {selectedEmployee.displayName ?? selectedEmployee.legalName}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isZh ? '入职日' : 'Employment start'}:{' '}
                {selectedEmployee.employmentStartDate}
              </p>
              {currentEmployeeConfig ? (
                <div className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                  <span>
                    {isZh ? '当前配置' : 'Current config'} v
                    {currentEmployeeConfig.version} ·{' '}
                    {currentEmployeeConfig.effectiveFrom}
                  </span>
                  <span>
                    {currentEmployeeConfig.payFrequency} ·{' '}
                    {payrollMoney(currentEmployeeConfig.defaultHourlyRateCents)}
                    /h
                  </span>
                  <span>
                    Tax {currentEmployeeConfig.incomeTaxTreatment} · CPP{' '}
                    {currentEmployeeConfig.cppTreatment}
                  </span>
                  <span>
                    EI {currentEmployeeConfig.eiTreatment} · Vacation{' '}
                    {(currentEmployeeConfig.vacationRateBasisPoints / 100).toFixed(
                      2,
                    )}
                    %
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-slate-500">
                  {isZh ? '还没有员工工资配置' : 'No employee payroll config yet'}
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {isZh ? '先在顶部选择员工。' : 'Select an employee above first.'}
            </p>
          )}

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
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {isZh
                  ? '新增员工法定配置版本'
                  : 'Add employee statutory config version'}
              </summary>
              <div className="mt-3">
                <PayrollEmployeeConfigForm
                  isZh={isZh}
                  employeeStableId={selectedEmployeeStableId}
                  onChanged={onChanged}
                />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
