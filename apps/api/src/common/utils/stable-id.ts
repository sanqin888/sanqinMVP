///Users/apple/sanqinMVP/apps/api/src/common/utils
import { randomBytes } from 'node:crypto';
import {
  isStableId as isSharedStableId,
  normalizeStableId as normalizeSharedStableId,
} from '@shared/menu';

export const isStableId = isSharedStableId;

export function assertStableId(value: unknown, label = 'id'): string {
  if (!isStableId(value)) {
    throw new Error(`${label} must be a cuid`);
  }
  return value;
}

export function normalizeStableId(value: unknown): string | null {
  const normalized = normalizeSharedStableId(value);
  return normalized || null;
}

export function generateStableId(): string {
  const random = BigInt(`0x${randomBytes(16).toString('hex')}`)
    .toString(36)
    .padStart(24, '0')
    .slice(0, 24);
  return `c${random}`;
}
