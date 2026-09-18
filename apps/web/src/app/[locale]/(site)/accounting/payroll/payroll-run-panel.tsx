'use client';

import { FormEvent, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import {
  parseHoursToMinutes,
  parseMoneyToCents,
  payrollLocalDateToday,
  payrollMoney,
  type PayrollCalculationResponse,
  type PayrollEmployeeConfig,
  type PayrollRun,
} from './payroll-types';
import { PayrollRunReview } from './payroll-run-review';

type Props = {
  isZh: boolean;
  employeeStableId: string;
  employeeConfigs: PayrollEmployeeConfig[];
  runs: PayrollRun[];
  selectedRunStableId: string;
  onRunSelect: (value: string) => void;
  onChanged: () => Promise<void>;
};

const statusLabel = (status: PayrollRun['status'], isZh: boolean) => {
  const zh: Record<PayrollRun['status'], string> = {
    DRAFT: '草稿',
    CALCULATED: '已计算',
    APPROVED: '已批准',
    POSTED: '已入账',
    REVERSED: '已冲销',
    VOIDED: '已作废',
  };
  return isZh ? zh[status] : status;
};

const editableStatuses = new Set<PayrollRun['status']>(['DRAFT', 'CALCULATED']);

export function PayrollRunPanel({
  isZh,
  employeeStableId,
  employeeConfigs,
  runs,
  selectedRunStableId,
  onRunSelect,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState(payrollLocalDateToday());
  const [periodEnd, setPeriodEnd] = useState(payrollLocalDateToday());
  const [payDate, setPayDate] = useState(payrollLocalDateToday());
  const [regularHours, setRegularHours] = useState('0');
  const [hourlyRate, setHourlyRate] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [overtimeRate, setOvertimeRate] = useState('0.00');
  const [vacationTopUp, setVacationTopUp] = useState('0.00');

  const selectedRun = useMemo(
    () => runs.find((item) => item.runStableId === selectedRunStableId) ?? null,
    [runs, selectedRunStableId],
  );
  const currentConfig = employeeConfigs[0] ?? null;

  async function execute(
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await onChanged();
      setMessage(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function createRun(event: FormEvent) {
    event.preventDefault();
    if (!employeeStableId) return;

    let regularMinutes: number;
    let regularHourlyRateCents: number | undefined;
    let overtimeMinutes: number;
    let overtimeHourlyRateCents: number;
    let vacationTopUpCents: number;
    try {
      regularMinutes = parseHoursToMinutes(
        regularHours,
        isZh ? '正常工时' : 'Regular hours',
      );
      regularHourlyRateCents = hourlyRate.trim()
        ? parseMoneyToCents(
            hourlyRate,
            isZh ? '本期时薪' : 'Run hourly rate',
          )
        : undefined;
      overtimeMinutes = parseHoursToMinutes(
        overtimeHours,
        isZh ? '加班工时' : 'Overtime hours',
      );
      overtimeHourlyRateCents = parseMoneyToCents(
        overtimeRate,
        isZh ? '加班时薪' : 'Overtime rate',
      );
      vacationTopUpCents = parseMoneyToCents(
        vacationTopUp,
        isZh ? 'Vacation top-up' : 'Vacation top-up',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }

    void execute(
      async () => {
        const created = await apiFetch<PayrollRun>(
          '/accounting/payroll/runs',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeStableId,
              periodStart,
              periodEnd,
              payDate,
              regularMinutes,
              ...(regularHourlyRateCents === undefined
                ? {}
                : { regularHourlyRateCents }),
              overtimeMinutes,
              overtimeHourlyRateCents,
              vacationTopUpCents,
            }),
          },
        );
        onRunSelect(created.runStableId);
      },
      isZh ? '工资草稿已创建。' : 'Payroll draft created.',
    );
  }

  function loadRunIntoEditor(run: PayrollRun) {
    setPeriodStart(run.periodStart);
    setPeriodEnd(run.periodEnd);
    setPayDate(run.payDate);
    setRegularHours((run.regularMinutes / 60).toFixed(2));
    setHourlyRate((run.regularHourlyRateCents / 100).toFixed(2));
    setOvertimeHours((run.overtimeMinutes / 60).toFixed(2));
    setOvertimeRate((run.overtimeHourlyRateCents / 100).toFixed(2));
    setVacationTopUp((run.vacationTopUpCents / 100).toFixed(2));
    setMessage(
      isZh
        ? '已把选中工资载入上方编辑器。'
        : 'Selected run loaded into the editor above.',
    );
  }

  function updateSelectedRun() {
    if (!selectedRun || !editableStatuses.has(selectedRun.status)) return;

    let regularMinutes: number;
    let regularHourlyRateCents: number;
    let overtimeMinutes: number;
    let overtimeHourlyRateCents: number;
    let vacationTopUpCents: number;
    try {
      regularMinutes = parseHoursToMinutes(
        regularHours,
        isZh ? '正常工时' : 'Regular hours',
      );
      regularHourlyRateCents = parseMoneyToCents(
        hourlyRate,
        isZh ? '本期时薪' : 'Run hourly rate',
      );
      overtimeMinutes = parseHoursToMinutes(
        overtimeHours,
        isZh ? '加班工时' : 'Overtime hours',
      );
      overtimeHourlyRateCents = parseMoneyToCents(
        overtimeRate,
        isZh ? '加班时薪' : 'Overtime rate',
      );
      vacationTopUpCents = parseMoneyToCents(
        vacationTopUp,
        isZh ? 'Vacation top-up' : 'Vacation top-up',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }

    void execute(
      () =>
        apiFetch(
          '/accounting/payroll/runs/' +
            encodeURIComponent(selectedRun.runStableId),
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              periodStart,
              periodEnd,
              payDate,
              regularMinutes,
              regularHourlyRateCents,
              overtimeMinutes,
              overtimeHourlyRateCents,
              vacationTopUpCents,
            }),
          },
        ),
      isZh
        ? '工资草稿已更新；旧计算结果已失效。'
        : 'Payroll draft updated; the previous calculation is invalidated.',
    );
  }

  function calculate(runStableId: string) {
    void execute(
      async () => {
        const result = await apiFetch<PayrollCalculationResponse>(
          '/accounting/payroll/runs/' +
            encodeURIComponent(runStableId) +
            '/calculate',
          { method: 'POST' },
        );
        if (!result.ok) {
          const detail = result.reason.field
            ? result.reason.message + ' [' + result.reason.field + ']'
            : result.reason.message;
          throw new Error(detail);
        }
      },
      isZh ? '工资计算已刷新。' : 'Payroll calculation refreshed.',
    );
  }

  function approve(runStableId: string) {
    void execute(
      () =>
        apiFetch(
          '/accounting/payroll/runs/' +
            encodeURIComponent(runStableId) +
            '/approve',
          { method: 'POST' },
        ),
      isZh ? '工资已批准并冻结。' : 'Payroll run approved and frozen.',
    );
  }

  function voidRun(runStableId: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(isZh ? '确定作废这张已批准工资？' : 'Void this approved payroll run?')
    ) {
      return;
    }
    void execute(
      () =>
        apiFetch(
          '/accounting/payroll/runs/' +
            encodeURIComponent(runStableId) +
            '/void',
          { method: 'POST' },
        ),
      isZh ? '工资已作废。' : 'Payroll run voided.',
    );
  }

  if (!employeeStableId) {
    return null;
  }

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">
          {isZh ? '工资周期与审批' : 'Pay runs & approval'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '这里只输入工时/费率并审核服务端结果；税、CPP/CPP2、EI 全部由后端计算。'
            : 'Enter hours/rates and review server results here; tax, CPP/CPP2 and EI are calculated only by the backend.'}
        </p>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      <form
        className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-4"
        onSubmit={createRun}
      >
        <label className="text-xs text-slate-500">
          {isZh ? '周期开始' : 'Period start'}
          <input
            type="date"
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          {isZh ? '周期结束' : 'Period end'}
          <input
            type="date"
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          {isZh ? '发薪日' : 'Pay date'}
          <input
            type="date"
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
            value={payDate}
            onChange={(event) => setPayDate(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          {isZh ? '正常工时' : 'Regular hours'}
          <input
            inputMode="decimal"
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
            value={regularHours}
            onChange={(event) => setRegularHours(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          {isZh ? '本期时薪（留空用默认）' : 'Run hourly rate (blank = default)'}
          <input
            inputMode="decimal"
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
            value={hourlyRate}
            onChange={(event) => setHourlyRate(event.target.value)}
            placeholder={
              currentConfig
                ? payrollMoney(currentConfig.defaultHourlyRateCents)
                : '0.00'
            }
          />
        </label>
        <label className="text-xs text-slate-500">
          {isZh ? '加班工时' : 'Overtime hours'}
          <input
            inputMode="decimal"
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
            value={overtimeHours}
            onChange={(event) => setOvertimeHours(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          {isZh ? '加班时薪' : 'Overtime rate'}
          <input
            inputMode="decimal"
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
            value={overtimeRate}
            onChange={(event) => setOvertimeRate(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          Vacation top-up
          <input
            inputMode="decimal"
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
            value={vacationTopUp}
            onChange={(event) => setVacationTopUp(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
          <button
            disabled={busy || !currentConfig}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isZh ? '创建工资草稿' : 'Create payroll draft'}
          </button>
          {selectedRun && editableStatuses.has(selectedRun.status) ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => loadRunIntoEditor(selectedRun)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {isZh ? '载入选中记录' : 'Load selected run'}
              </button>
              <button
                type="button"
                disabled={busy || !hourlyRate.trim()}
                onClick={updateSelectedRun}
                className="rounded-lg border border-[#87362E]/30 px-4 py-2 text-sm font-medium text-[#762f28] disabled:opacity-50"
              >
                {isZh ? '更新选中草稿' : 'Update selected draft'}
              </button>
            </>
          ) : null}
        </div>
      </form>

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        <div className="space-y-2">
          <h3 className="font-semibold">{isZh ? '历史与草稿' : 'Runs'}</h3>
          {!runs.length ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              {isZh ? '暂无工资记录。' : 'No payroll runs yet.'}
            </p>
          ) : null}
          {runs.map((run) => (
            <button
              key={run.runStableId}
              type="button"
              onClick={() => onRunSelect(run.runStableId)}
              className={
                run.runStableId === selectedRunStableId
                  ? 'w-full rounded-xl border border-[#87362E]/30 bg-[#87362E]/5 p-3 text-left'
                  : 'w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50'
              }
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{run.payDate}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                  {statusLabel(run.status, isZh)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {run.periodStart} → {run.periodEnd}
              </p>
              <p className="mt-2 text-sm font-semibold">
                {payrollMoney(run.netPayCents)}
              </p>
            </button>
          ))}
        </div>

        {selectedRun ? (
          <PayrollRunReview
            isZh={isZh}
            run={selectedRun}
            busy={busy}
            calculate={calculate}
            approve={approve}
            voidRun={voidRun}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            {isZh ? '选择一张工资记录查看明细。' : 'Select a payroll run to review.'}
          </div>
        )}
      </div>
    </section>
  );
}

