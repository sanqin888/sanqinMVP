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
