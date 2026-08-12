import {
  parseUberWebhookEnvelopeV1,
  type UberWebhookEnvelopePayloadV1,
  type UberWebhookEventV1,
} from './uber-webhook-envelope.v1';

/** Uber wire payload for an order notification. */
export type UberOrderNotificationPayloadV1 = UberWebhookEnvelopePayloadV1;

/** Domain-safe, normalized order notification. */
export interface UberOrderNotificationEventV1 extends UberWebhookEventV1 {
  family: 'order';
}

export function parseUberOrderNotificationV1(
  payload: unknown,
): UberOrderNotificationEventV1 | null {
  const event = parseUberWebhookEnvelopeV1(payload);
  if (!event || event.eventType !== 'orders.notification') return null;
  return { ...event, family: 'order' };
}
