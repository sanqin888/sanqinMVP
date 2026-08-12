import {
  parseUberWebhookEnvelopeV1,
  type UberWebhookEventV1,
} from './uber-webhook-envelope.v1';

export type UberStoreProvisioningEventNameV1 =
  | 'store.provisioned'
  | 'store.deprovisioned';

export interface UberStoreProvisioningEventV1 extends UberWebhookEventV1 {
  family: 'store-provisioning';
  eventType: UberStoreProvisioningEventNameV1;
  storeId: string;
  provisioned: boolean;
}

/** Provisioning uses the standard envelope; meta.resource_id is the store id. */
export function parseUberStoreProvisioningV1(
  payload: unknown,
): UberStoreProvisioningEventV1 | null {
  const event = parseUberWebhookEnvelopeV1(payload);
  if (
    !event ||
    (event.eventType !== 'store.provisioned' &&
      event.eventType !== 'store.deprovisioned')
  )
    return null;
  return {
    ...event,
    family: 'store-provisioning',
    eventType: event.eventType,
    storeId: event.resourceId,
    provisioned: event.eventType === 'store.provisioned',
  };
}
