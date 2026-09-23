export const ACCOUNTING_BUSINESS_TIMEZONE = 'America/Toronto';

export type AccountingReportPreset =
  | 'month'
  | 'lastMonth'
  | 'quarter'
  | 'year';

export type AccountingDateRange = {
  from: string;
  to: string;
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value: string): { year: number; month: number; day: number } {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new Error(`Invalid date-only value: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date-only value: ${value}`);
  }
  return { year, month, day };
}

function formatDateOnly(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function utcDateOnly(year: number, monthIndex: number, day: number): string {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return formatDateOnly(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function accountingBusinessDateToday(
  now = new Date(),
  timezone = ACCOUNTING_BUSINESS_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(values.get('year'));
  const month = Number(values.get('month'));
  const day = Number(values.get('day'));
  if (![year, month, day].every(Number.isInteger)) {
    throw new Error(`Unable to resolve business date for timezone ${timezone}`);
  }
  return formatDateOnly(year, month, day);
}

export function accountingReportPresetRange(
  preset: AccountingReportPreset,
  today: string,
): AccountingDateRange {
  const { year, month } = parseDateOnly(today);

  if (preset === 'month') {
    return {
      from: formatDateOnly(year, month, 1),
      to: today,
    };
  }

  if (preset === 'lastMonth') {
    return {
      from: utcDateOnly(year, month - 2, 1),
      to: utcDateOnly(year, month - 1, 0),
    };
  }

  if (preset === 'quarter') {
    const quarterStartMonthIndex = Math.floor((month - 1) / 3) * 3;
    return {
      from: utcDateOnly(year, quarterStartMonthIndex, 1),
      to: today,
    };
  }

  return {
    from: formatDateOnly(year, 1, 1),
    to: today,
  };
}
