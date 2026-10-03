export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const localDateToday = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const newRequestId = (): string => crypto.randomUUID();

export const dollarsToCents = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!/^[-+]?\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
};

export const centsToDollars = (cents: number): string =>
  (cents / 100).toFixed(2);
