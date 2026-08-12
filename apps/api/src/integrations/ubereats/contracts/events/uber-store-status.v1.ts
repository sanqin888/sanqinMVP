import type { UberWebhookEnvelopePayloadV1 } from './uber-webhook-envelope.v1';

export interface UberStoreStatusChangedPayloadV1 extends UberWebhookEnvelopePayloadV1 {
  event_type: 'store.status.changed';
  status?: string;
}
export const UBER_STORE_STATUS_WIRE_VERSION_V1 = 1 as const;
