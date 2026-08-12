import {
  parseUberWebhookEnvelopeV1,
  type UberWebhookEventV1,
} from './uber-webhook-envelope.v1';

export interface UberStoreStatusChangedEventV1 extends UberWebhookEventV1 {
  family: 'store-status';
  eventType: 'store.status.changed';
  storeId: string;
}

/** Parser is kept separate because status events are quarantined until mapped locally. */
export function parseUberStoreStatusChangedV1(
  payload: unknown,
): UberStoreStatusChangedEventV1 | null {
  const event = parseUberWebhookEnvelopeV1(payload);
  return event?.eventType === 'store.status.changed'
    ? {
        ...event,
        family: 'store-status',
        eventType: 'store.status.changed',
        storeId: event.resourceId,
      }
    : null;
}
