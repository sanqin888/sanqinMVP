import { PayrollPayFrequency } from './payroll-contracts';

const DAY_MS = 86_400_000;

const utcDayNumber = (date: Date): number => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('pay schedule date must be valid');
  }
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      DAY_MS,
  );
};

const countIntervalDatesInYear = (
  anchorDate: Date,
  taxYear: number,
  intervalDays: number,
): number => {
  const anchorDay = utcDayNumber(anchorDate);
  const yearStart = Math.floor(Date.UTC(taxYear, 0, 1) / DAY_MS);
  const nextYearStart = Math.floor(Date.UTC(taxYear + 1, 0, 1) / DAY_MS);
  const offset = yearStart - anchorDay;
  const steps = Math.ceil(offset / intervalDays);
  const firstDay = anchorDay + steps * intervalDays;

  if (firstDay >= nextYearStart) return 0;
  return Math.ceil((nextYearStart - firstDay) / intervalDays);
};

export const derivePayrollPayPeriodsPerYear = ({
  payFrequency,
  payScheduleAnchorDate,
  taxYear,
}: {
  payFrequency: PayrollPayFrequency;
  payScheduleAnchorDate: Date;
  taxYear: number;
}): number => {
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 9999) {
    throw new Error('taxYear must be a four-digit year');
  }

  switch (payFrequency) {
    case PayrollPayFrequency.WEEKLY:
      return countIntervalDatesInYear(payScheduleAnchorDate, taxYear, 7);
    case PayrollPayFrequency.BIWEEKLY:
      return countIntervalDatesInYear(payScheduleAnchorDate, taxYear, 14);
    case PayrollPayFrequency.SEMIMONTHLY:
      return 24;
    case PayrollPayFrequency.MONTHLY:
      return 12;
  }
};
