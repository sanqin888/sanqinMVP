<<<<<<< HEAD
import type { UberMenuNotificationStatus } from '../../domain/webhook/uber-webhook.types';

/** V1 wire status is currently identical to the domain lifecycle vocabulary. */
export type UberMenuNotificationStatusV1 = UberMenuNotificationStatus;

/** Uber-owned menu notification wire shape frozen by the v1 contract fixture. */
export interface UberMenuNotificationPayloadV1 {
  data?: {
    status?: unknown;
    failure_info?: { errors?: unknown };
    [key: string]: unknown;
  };
  meta?: {
    user_id?: unknown;
    resource_id?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const UBER_MENU_NOTIFICATION_WIRE_VERSION_V1 = 1 as const;
=======
export type UberMenuNotificationStatusV1 =
  | 'SUBMITTED'
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED';

/** Uber-owned menu notification wire shape (legacy locations remain optional). */
export interface UberMenuNotificationPayloadV1 {
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UberMenuNotificationEventV1 {
  version: 1;
  family: 'menu';
  storeId: string;
  resourceId: string;
  status: UberMenuNotificationStatusV1;
  failures: Array<{ code: string; path: string | null; message: string }>;
}

export function parseUberMenuNotificationV1(
  payload: unknown,
): UberMenuNotificationEventV1 | null {
  const root = asObject(payload);
  const data = asObject(root?.data);
  const meta = asObject(root?.meta);
  const storeId = read(data?.store_id) ?? read(meta?.user_id);
  const resourceId = read(data?.resource_id) ?? read(meta?.resource_id);
  const status = read(data?.status)?.toUpperCase();
  if (
    !storeId ||
    !resourceId ||
    !status ||
    !['SUBMITTED', 'PENDING', 'SUCCEEDED', 'FAILED'].includes(status)
  )
    return null;
  const failure = asObject(data?.failure_info);
  const errors = Array.isArray(failure?.errors)
    ? failure.errors
    : Array.isArray(data?.errors)
      ? data.errors
      : [];
  return {
    version: 1,
    family: 'menu',
    storeId,
    resourceId,
    status: status as UberMenuNotificationStatusV1,
    failures: errors.map((entry) => {
      const error = asObject(entry);
      return {
        code: read(error?.code) ?? 'UBER_MENU_ERROR',
        path: read(error?.path) ?? read(error?.field_path),
        message:
          read(error?.message) ??
          read(error?.description) ??
          'Uber 未提供错误说明',
      };
    }),
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function read(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
>>>>>>> origin/main
