import { createHash } from 'node:crypto';

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

const canonicalize = (value: unknown): CanonicalJson => {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('calculation evidence contains a non-finite number');
    }
    return value;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('calculation evidence contains an invalid date');
    }
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  throw new Error('calculation evidence contains an unsupported value');
};

export const canonicalPayrollJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value));

export const hashPayrollCalculationEvidence = (value: unknown): string =>
  `sha256:${createHash('sha256').update(canonicalPayrollJson(value)).digest('hex')}`;
