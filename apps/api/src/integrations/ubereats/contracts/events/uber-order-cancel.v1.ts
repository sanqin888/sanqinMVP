import type { UberWebhookEnvelopePayloadV1 } from './uber-webhook-envelope.v1';

/** Uber Eats order cancellation webhook (wire contract v1). */
export type UberOrderCancelPayloadV1 = UberWebhookEnvelopePayloadV1;
export const UBER_ORDER_CANCEL_WIRE_VERSION_V1 = 1 as const;
