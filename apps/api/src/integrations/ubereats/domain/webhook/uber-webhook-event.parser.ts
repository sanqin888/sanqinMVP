import { normalizeUberEventType } from './uber-event-type';
import {
  parseUberWebhookEnvelopeV1,
  webhookObject,
  webhookText,
  type UberWebhookEventV1,
} from './uber-webhook-envelope';
import type { UberMenuNotificationStatus } from './uber-webhook.types';

export interface UberOrderNotificationEventV1 extends UberWebhookEventV1 {
  family: 'order';
  resourceHref: string;
  userId: string;
}
export interface UberOrderCancelEventV1 extends UberWebhookEventV1 {
  family: 'order-cancel';
  resourceHref: string;
  userId: string;
}
export interface UberStoreProvisioningEventV1 extends UberWebhookEventV1 {
  family: 'store-provisioning';
  eventType: 'store.provisioned' | 'store.deprovisioned';
  storeId: string;
  provisioned: boolean;
}
export interface UberStoreStatusChangedEventV1 extends UberWebhookEventV1 {
  family: 'store-status';
  eventType: 'store.status.changed';
  storeId: string;
}
export interface UberMenuNotificationEventV1 {
  version: 1;
  family: 'menu';
  storeId: string;
  resourceId: string;
  status: UberMenuNotificationStatus;
  failures: Array<{ code: string; path: string | null; message: string }>;
}
export interface UberEventOrdering {
  occurredAt: Date | null;
  resourceVersion: string | null;
  sequence: number | null;
}

export function parseUberOrderNotificationV1(payload: unknown) {
  const event = parseUberWebhookEnvelopeV1(payload);
  const eventType = normalizeUberEventType(event?.eventType ?? '');
  return event &&
    (eventType === 'orders.notification' ||
      eventType === 'orders.scheduled.notification')
    ? ({ ...event, family: 'order' } as UberOrderNotificationEventV1)
    : null;
}

export function parseUberOrderCancelV1(payload: unknown) {
  const event = parseUberWebhookEnvelopeV1(payload);
  return event?.eventType === 'orders.cancel'
    ? ({ ...event, family: 'order-cancel' } as UberOrderCancelEventV1)
    : null;
}

export function parseUberStoreProvisioningV1(payload: unknown) {
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
  } satisfies UberStoreProvisioningEventV1;
}

export function parseUberStoreStatusChangedV1(payload: unknown) {
  const event = parseUberWebhookEnvelopeV1(payload);
  return event?.eventType === 'store.status.changed'
    ? ({
        ...event,
        family: 'store-status',
        eventType: 'store.status.changed',
        storeId: event.resourceId,
      } satisfies UberStoreStatusChangedEventV1)
    : null;
}

export function parseUberMenuNotificationV1(payload: unknown) {
  const root = webhookObject(payload);
  const data = webhookObject(root?.data);
  const meta = webhookObject(root?.meta);
  const storeId = webhookText(meta?.user_id);
  const resourceId = webhookText(meta?.resource_id);
  const status = webhookText(data?.status)?.toUpperCase();
  if (
    !storeId ||
    !resourceId ||
    !status ||
    !['SUBMITTED', 'PENDING', 'SUCCEEDED', 'FAILED'].includes(status)
  )
    return null;
  const failure = webhookObject(data?.failure_info);
  const errors = Array.isArray(failure?.errors) ? failure.errors : [];
  return {
    version: 1,
    family: 'menu',
    storeId,
    resourceId,
    status: status as UberMenuNotificationStatus,
    failures: errors.map((entry) => {
      const error = webhookObject(entry);
      return {
        code: webhookText(error?.code) ?? 'UBER_MENU_ERROR',
        path: webhookText(error?.path),
        message: webhookText(error?.message) ?? 'Uber 未提供错误说明',
      };
    }),
  } satisfies UberMenuNotificationEventV1;
}

export type UberWebhookDispatchResult =
  | {
      kind: 'order';
      event: UberOrderNotificationEventV1;
      ordering: UberEventOrdering;
    }
  | {
      kind: 'order-cancel';
      event: UberOrderCancelEventV1;
      ordering: UberEventOrdering;
    }
  | { kind: 'menu'; event: UberMenuNotificationEventV1 }
  | { kind: 'store-provisioning'; event: UberStoreProvisioningEventV1 }
  | { kind: 'unsupported'; reason: 'event' | 'version' }
  | { kind: 'invalid' };

/** Version-aware, pure domain entry point for inbox payload interpretation. */
export function dispatchUberWebhookV1(input: {
  eventType: string;
  businessVersion: string;
  payload: unknown;
}): UberWebhookDispatchResult {
  if (input.businessVersion !== 'v1')
    return { kind: 'unsupported', reason: 'version' };
  const eventType = normalizeUberEventType(input.eventType);
  if (eventType === 'store.status.changed') {
    return parseUberStoreStatusChangedV1(input.payload)
      ? { kind: 'unsupported', reason: 'event' }
      : { kind: 'invalid' };
  }
  const parser =
    eventType === 'orders.notification' ||
    eventType === 'orders.scheduled.notification'
      ? parseUberOrderNotificationV1
      : eventType === 'orders.cancel'
        ? parseUberOrderCancelV1
        : eventType === 'menus.notification'
          ? parseUberMenuNotificationV1
          : eventType === 'store.provisioned' ||
              eventType === 'store.deprovisioned'
            ? parseUberStoreProvisioningV1
            : null;
  if (!parser) return { kind: 'unsupported', reason: 'event' };
  const event = parser(input.payload);
  if (!event) return { kind: 'invalid' };
  if (event.family === 'order')
    return { kind: 'order', event, ordering: parseOrdering(input.payload) };
  if (event.family === 'order-cancel')
    return {
      kind: 'order-cancel',
      event,
      ordering: parseOrdering(input.payload),
    };
  if (event.family === 'menu') return { kind: 'menu', event };
  return { kind: 'store-provisioning', event };
}

function parseOrdering(payload: unknown): UberEventOrdering {
  const root = webhookObject(payload);
  const meta = webhookObject(root?.meta);
  const timestamp = webhookText(
    root?.event_time,
    root?.event_timestamp,
    root?.occurred_at,
    root?.created_at,
    meta?.event_time,
  );
  const occurredAt = timestamp ? new Date(timestamp) : null;
  const rawSequence = root?.sequence ?? root?.sequence_number ?? meta?.sequence;
  const sequence =
    typeof rawSequence === 'number' && Number.isSafeInteger(rawSequence)
      ? rawSequence
      : typeof rawSequence === 'string' && /^\d+$/.test(rawSequence)
        ? Number(rawSequence)
        : null;
  return {
    occurredAt:
      occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
    resourceVersion: webhookText(
      root?.resource_version,
      root?.version,
      meta?.resource_version,
    ),
    sequence:
      sequence !== null && Number.isSafeInteger(sequence) ? sequence : null,
  };
}
