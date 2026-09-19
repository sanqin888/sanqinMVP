export const payrollLocalDateToday = (): string => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
};

export const payrollMoney = (cents: number | null | undefined): string =>
  cents == null ? '—' : '$' + (cents / 100).toFixed(2);

export const payrollHours = (minutes: number): string =>
  (minutes / 60).toFixed(2);

export const parseMoneyToCents = (raw: string, field: string): number => {
  const normalized = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(
      field + ' must be a non-negative amount with at most 2 decimals',
    );
  }
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) {
    throw new Error(field + ' is too large');
  }
  return cents;
};

export const parseHoursToMinutes = (raw: string, field: string): number => {
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error(field + ' must be a non-negative number');
  }
  const minutes = Math.round(hours * 60);
  if (!Number.isSafeInteger(minutes)) {
    throw new Error(field + ' is too large');
  }
  return minutes;
};
