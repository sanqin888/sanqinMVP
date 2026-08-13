import type { UberOrderStatus } from '../../domain/orders/uber-order.types';
import type { UberJsonValue } from '../shared/uber-json-value';
import type { UberWebhookVerificationInput } from '../../domain/webhook/uber-webhook.types';

export interface UberOrderStatusAuditPort {
  record(eventName: string, payload: UberJsonValue): Promise<void>;
}
export const UBER_ORDER_STATUS_AUDIT_PORT = Symbol(
  'UBER_ORDER_STATUS_AUDIT_PORT',
);

export type UberWebhookInboxItem = {
  eventId: string;
  eventType: string;
  payload: unknown;
  leaseToken: string;
  idempotencyKey: string;
  businessVersion: string;
  resourceKey?: string | null;
};

export type UberEventOrdering = {
  occurredAt: Date | null;
  resourceVersion: string | null;
  sequence: number | null;
};

export interface UberWebhookInboxPort {
  enqueue(input: {
    eventId: string;
    eventType: string;
    externalOrderId: string | null;
    payload: unknown;
  }): Promise<boolean>;
  claimDue(limit: number): Promise<UberWebhookInboxItem[]>;
  markSucceeded(item: UberWebhookInboxItem): Promise<boolean>;
  markUnsupported(
    item: UberWebhookInboxItem,
    details: {
      code: 'UBER_WEBHOOK_EVENT_UNSUPPORTED';
      eventType: string;
      safeSummary: string;
      businessVersion: string;
    },
  ): Promise<boolean>;
  requeueUnsupported(
    eventIds: string[],
    supportedEventTypes: string[],
    businessVersion: string,
  ): Promise<number>;
  markFailed(
    item: UberWebhookInboxItem,
    error: unknown,
    retryable: boolean,
  ): Promise<boolean>;
  setStoreProvisioned(
    storeId: string,
    isProvisioned: boolean,
  ): Promise<boolean>;
}
export const UBER_WEBHOOK_INBOX_PORT = Symbol('UBER_WEBHOOK_INBOX_PORT');

export interface UberWebhookSignatureVerifier {
  verify(input: UberWebhookVerificationInput): void;
}
export const UBER_WEBHOOK_SIGNATURE_VERIFIER = Symbol(
  'UBER_WEBHOOK_SIGNATURE_VERIFIER',
);

/** Status accepted by application order synchronization boundaries. */
export type UberOrderSyncStatus = UberOrderStatus;
