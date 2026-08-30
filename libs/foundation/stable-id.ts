const CUID_V1_REGEX = /^c[0-9a-z]{24}$/i;

export function isStableId(value: unknown): value is string {
  return typeof value === 'string' && CUID_V1_REGEX.test(value);
}

export function normalizeStableId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return isStableId(normalized) ? normalized : null;
}

export function assertStableId(value: unknown, label = 'id'): string {
  if (!isStableId(value)) {
    throw new Error(`${label} must be a cuid`);
  }
  return value;
}
