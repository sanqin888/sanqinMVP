// Unique stable id regex (cuid v1)
const CUID_V1_REGEX = /^c[0-9a-z]{24}$/i;

export function isStableId(value: unknown): value is string {
  return typeof value === 'string' && CUID_V1_REGEX.test(value);
}

export function normalizeStableId(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return isStableId(trimmed) ? trimmed : '';
}
