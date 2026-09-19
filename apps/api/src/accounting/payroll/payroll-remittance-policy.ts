import { PayrollRemitterType } from './payroll-contracts';

export const PAYROLL_REMITTANCE_POLICY_VERSION =
  'CA-CRA-REMIT-2026-V1' as const;

export type PayrollRemittancePeriod = {
  remittancePolicyVersion: typeof PAYROLL_REMITTANCE_POLICY_VERSION;
  remitterType: PayrollRemitterType;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
};

const DAY_MS = 86_400_000;

/**
 * CRA-recognized public holidays relevant to the Ontario-only Payroll MVP.
 *
 * The 2026 policy intentionally excludes Saint-Jean-Baptiste Day because that
 * CRA holiday is Quebec-only. 2027-01-01 is included solely so a Threshold 2
 * period ending on 2026-12-31 can count its three working days correctly.
 */
const CRA_RECOGNIZED_HOLIDAYS_CA_ON_2026 = new Set([
  '2026-01-01',
  '2026-04-03',
  '2026-04-06',
  '2026-05-18',
  '2026-07-01',
  '2026-08-03',
  '2026-09-07',
  '2026-09-30',
  '2026-10-12',
  '2026-11-11',
  '2026-12-25',
  '2026-12-26',
  '2027-01-01',
]);

const toUtcDateOnly = (date: Date): Date => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('payDate must be valid');
  }
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
};

const formatDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * DAY_MS);

const startOfMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const endOfMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

const dateInMonth = (date: Date, day: number, monthOffset = 0): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, day),
  );

const isCraWorkingDay = (date: Date): boolean => {
  const weekday = date.getUTCDay();
  return (
    weekday !== 0 &&
    weekday !== 6 &&
    !CRA_RECOGNIZED_HOLIDAYS_CA_ON_2026.has(formatDateOnly(date))
  );
};

const nextCraWorkingDayOnOrAfter = (date: Date): Date => {
  let cursor = date;
  while (!isCraWorkingDay(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
};

const addCraWorkingDaysAfter = (date: Date, count: number): Date => {
  let cursor = date;
  let remaining = count;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (isCraWorkingDay(cursor)) {
      remaining -= 1;
    }
  }
  return cursor;
};

const requireSupportedPayDate = (raw: Date): Date => {
  const payDate = toUtcDateOnly(raw);
  if (payDate.getUTCFullYear() !== 2026) {
    throw new Error(
      'CRA remittance policy CA-CRA-REMIT-2026-V1 supports only 2026 pay dates',
    );
  }
  return payDate;
};

const buildQuarterlyPeriod = (payDate: Date) => {
  const quarterStartMonth = Math.floor(payDate.getUTCMonth() / 3) * 3;
  const periodStart = new Date(
    Date.UTC(payDate.getUTCFullYear(), quarterStartMonth, 1),
  );
  const periodEnd = new Date(
    Date.UTC(payDate.getUTCFullYear(), quarterStartMonth + 3, 0),
  );
  const nominalDueDate = new Date(
    Date.UTC(payDate.getUTCFullYear(), quarterStartMonth + 3, 15),
  );
  return {
    periodStart,
    periodEnd,
    dueDate: nextCraWorkingDayOnOrAfter(nominalDueDate),
  };
};

const buildRegularPeriod = (payDate: Date) => {
  const periodStart = startOfMonth(payDate);
  const periodEnd = endOfMonth(payDate);
  const nominalDueDate = dateInMonth(payDate, 15, 1);
  return {
    periodStart,
    periodEnd,
    dueDate: nextCraWorkingDayOnOrAfter(nominalDueDate),
  };
};

const buildThreshold1Period = (payDate: Date) => {
  const day = payDate.getUTCDate();
  if (day <= 15) {
    return {
      periodStart: startOfMonth(payDate),
      periodEnd: dateInMonth(payDate, 15),
      dueDate: nextCraWorkingDayOnOrAfter(dateInMonth(payDate, 25)),
    };
  }

  return {
    periodStart: dateInMonth(payDate, 16),
    periodEnd: endOfMonth(payDate),
    dueDate: nextCraWorkingDayOnOrAfter(dateInMonth(payDate, 10, 1)),
  };
};

const buildThreshold2Period = (payDate: Date) => {
  const day = payDate.getUTCDate();
  let periodStartDay: number;
  let periodEnd: Date;

  if (day <= 7) {
    periodStartDay = 1;
    periodEnd = dateInMonth(payDate, 7);
  } else if (day <= 14) {
    periodStartDay = 8;
    periodEnd = dateInMonth(payDate, 14);
  } else if (day <= 21) {
    periodStartDay = 15;
    periodEnd = dateInMonth(payDate, 21);
  } else {
    periodStartDay = 22;
    periodEnd = endOfMonth(payDate);
  }

  return {
    periodStart: dateInMonth(payDate, periodStartDay),
    periodEnd,
    dueDate: addCraWorkingDaysAfter(periodEnd, 3),
  };
};

export const derivePayrollCraRemittancePeriod = ({
  remitterType,
  payDate: rawPayDate,
}: {
  remitterType: PayrollRemitterType;
  payDate: Date;
}): PayrollRemittancePeriod => {
  const payDate = requireSupportedPayDate(rawPayDate);

  // T4001 calls Threshold 1/2 employers with one payroll per month
  // "monthly accelerated" remitters. That does not create a fifth due-date
  // formula here: the actual payday still falls into one reviewed Threshold
  // band, and empty bands must not become synthetic settlement facts.
  const period = (() => {
    switch (remitterType) {
      case PayrollRemitterType.QUARTERLY:
        return buildQuarterlyPeriod(payDate);
      case PayrollRemitterType.REGULAR:
        return buildRegularPeriod(payDate);
      case PayrollRemitterType.ACCELERATED_THRESHOLD_1:
        return buildThreshold1Period(payDate);
      case PayrollRemitterType.ACCELERATED_THRESHOLD_2:
        return buildThreshold2Period(payDate);
    }
  })();

  return {
    remittancePolicyVersion: PAYROLL_REMITTANCE_POLICY_VERSION,
    remitterType,
    payDate: formatDateOnly(payDate),
    periodStart: formatDateOnly(period.periodStart),
    periodEnd: formatDateOnly(period.periodEnd),
    dueDate: formatDateOnly(period.dueDate),
  };
};
