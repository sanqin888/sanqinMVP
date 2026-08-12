import type { UberMenuNotificationStatus } from '../../domain/webhook/uber-webhook.types';

/** V1 wire status is currently identical to the domain lifecycle vocabulary. */
export type UberMenuNotificationStatusV1 = UberMenuNotificationStatus;

/** Uber-owned menu notification wire shape (legacy locations remain optional). */
export interface UberMenuNotificationPayloadV1 {
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export const UBER_MENU_NOTIFICATION_WIRE_VERSION_V1 = 1 as const;
