///Users/apple/sanqinMVP/apps/api/src/common/utils
import { randomBytes } from 'node:crypto';

// 仅允许 cuid v1：25 chars, starts with 'c'
const CUID_V1_REGEX = /^c[0-9a-z]{24}$/i;

export function isStableId(value: unknown): value is string {
  return typeof value === 'string' && CUID_V1_REGEX.test(value);
}

export function assertStableId(value: unknown, label = 'id'): string {
  if (!isStableId(value)) {
    throw new Error(`${label} must be a cuid`);
  }
  return value;
}

export function normalizeStableId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isStableId(trimmed) ? trimmed : null;
}

export function generateStableId(): string {
  const random = BigInt(`0x${randomBytes(16).toString('hex')}`)
    .toString(36)
    .padStart(24, '0')
    .slice(0, 24);
  return `c${random}`;
}
