import type { UberWebhookEnvelopePayloadV1 } from './uber-webhook-envelope.v1';

/** Uber wire payload for an order notification. */
export type UberOrderNotificationPayloadV1 = UberWebhookEnvelopePayloadV1;

export const UBER_ORDER_NOTIFICATION_WIRE_VERSION_V1 = 1 as const;
