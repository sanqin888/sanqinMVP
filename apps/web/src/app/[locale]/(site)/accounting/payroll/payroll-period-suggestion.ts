import type { PayrollEmployeeConfig, PayrollRun } from './payroll-types';

export type PayrollPeriodSuggestion = {
  periodStart: string;
  periodEnd: string;
  previousPeriodEnd: string;
};

const nextCalendarDay = (value: string): string => {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const calendarMonthEnd = (value: string): string => {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
};

export function suggestNextPayrollPeriod(
  employeeStableId: string,
  config: PayrollEmployeeConfig | null,
  runs: readonly PayrollRun[],
): PayrollPeriodSuggestion | null {
  if (!employeeStableId || config?.payFrequency !== 'MONTHLY') {
    return null;
  }

  const latest = runs
    .filter(
      (run) =>
        run.employeeStableId === employeeStableId && run.status !== 'VOIDED',
    )
    .reduce<PayrollRun | null>((current, run) => {
      if (!current) return run;
      if (run.periodEnd > current.periodEnd) return run;
      if (
        run.periodEnd === current.periodEnd &&
        run.correctionSequence > current.correctionSequence
      ) {
        return run;
      }
      return current;
    }, null);

  if (!latest || latest.status !== 'POSTED') return null;

  const periodStart = nextCalendarDay(latest.periodEnd);
  return {
    periodStart,
    periodEnd: calendarMonthEnd(periodStart),
    previousPeriodEnd: latest.periodEnd,
  };
}
