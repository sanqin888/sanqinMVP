export const normalizeAdminCustomerPhone = (
  raw?: string | null,
): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\D+/g, '');
  return normalized.length > 0 ? normalized : null;
};

export type AdminBirthdayUpdate =
  | { kind: 'none' }
  | { kind: 'clear' }
  | { kind: 'set'; birthdayYear: number; birthdayMonth: number }
  | { kind: 'invalid' };

export const resolveAdminBirthdayUpdate = (params: {
  birthdayYear?: number | null;
  birthdayMonth?: number | null;
  currentYear: number;
}): AdminBirthdayUpdate => {
  const wantsUpdate =
    params.birthdayYear !== undefined || params.birthdayMonth !== undefined;
  if (!wantsUpdate) return { kind: 'none' };

  if (params.birthdayYear == null && params.birthdayMonth == null) {
    return { kind: 'clear' };
  }

  const year = params.birthdayYear;
  const month = params.birthdayMonth;
  const valid =
    typeof year === 'number' &&
    typeof month === 'number' &&
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    year >= 1900 &&
    year <= params.currentYear &&
    month >= 1 &&
    month <= 12;

  return valid
    ? { kind: 'set', birthdayYear: year, birthdayMonth: month }
    : { kind: 'invalid' };
};
