import type { UberWebhookEnvelopePayloadV1 } from './uber-webhook-envelope.v1';

export type UberStoreProvisioningEventNameV1 =
  | 'store.provisioned'
  | 'store.deprovisioned';

export interface UberStoreProvisioningPayloadV1 extends UberWebhookEnvelopePayloadV1 {
  event_type: UberStoreProvisioningEventNameV1;
}
export const UBER_STORE_PROVISIONING_WIRE_VERSION_V1 = 1 as const;
