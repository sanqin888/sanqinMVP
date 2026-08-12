import {
  parseUberWebhookEnvelopeV1,
  type UberWebhookEventV1,
} from './uber-webhook-envelope.v1';

/** Uber Eats order cancellation webhook (wire contract v1). */
export interface UberOrderCancelEventV1 extends UberWebhookEventV1 {
  family: 'order-cancel';
}

export function parseUberOrderCancelV1(
  payload: unknown,
): UberOrderCancelEventV1 | null {
  const event = parseUberWebhookEnvelopeV1(payload);
  return event?.eventType === 'orders.cancel'
    ? { ...event, family: 'order-cancel' }
    : null;
}
