///Users/apple/sanqinMVP/apps/api/src/common/utils
import { createId } from '@paralleldrive/cuid2';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 允许传统 cuid（c开头）与 cuid2（默认长度 24，允许加盐扩展）
const CUID_REGEX = /^c[0-9a-z]{8,}$/i;

export function isStableId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (UUID_REGEX.test(value) || CUID_REGEX.test(value))
  );
}

export function assertStableId(value: unknown, label = 'id'): string {
  if (!isStableId(value)) {
    throw new Error(`${label} must be a cuid/uuid`);
  }
  return value;
}

export function normalizeStableId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isStableId(trimmed) ? trimmed : null;
}

export function generateStableId(): string {
  return createId();
}
