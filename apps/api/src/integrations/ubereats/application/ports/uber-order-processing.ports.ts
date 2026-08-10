import type {
  UberOrderActionName,
  UberOrderActionRecord,
  UberOrderStatus,
} from '../../domain/orders/uber-order.types';
import type { UberJsonValue } from './uber-persistence.ports';
import type { UberWebhookVerificationInput } from '../../domain/webhook/uber-webhook.types';

export type UberOrderOutboxItem = {
  taskId: string;
  leaseToken: string;
  externalOrderId: string;
  action: UberOrderActionName;
  reasonCode: string | null;
  reasonDetail: string | null;
  idempotencyKey: string;
  businessVersion: string;
};

export interface UberOrderOutboxPort {
  enqueue(
    externalOrderId: string,
    action: UberOrderActionName,
    audit?: { reasonCode?: string; reasonDetail?: string },
  ): Promise<UberOrderActionRecord>;
  claimDue(limit: number): Promise<UberOrderOutboxItem[]>;
  markSucceeded(item: UberOrderOutboxItem): Promise<boolean>;
  markFailed(item: UberOrderOutboxItem, error: unknown): Promise<boolean>;
}
export const UBER_ORDER_OUTBOX_PORT = Symbol('UBER_ORDER_OUTBOX_PORT');

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
  markSucceeded(item: UberWebhookInboxItem): Promise<void>;
  markFailed(
    item: UberWebhookInboxItem,
    error: unknown,
    retryable: boolean,
  ): Promise<void>;
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

export interface UberTelemetryPort {
  captureEvent(
    eventName: string,
    attributes?: Record<string, unknown>,
  ): Promise<void>;
  workflowLog(
    level: 'debug' | 'log' | 'warn' | 'error',
    message?: unknown,
  ): void;
}
export const UBER_TELEMETRY_PORT = Symbol('UBER_TELEMETRY_PORT');

/** Status accepted by application order synchronization boundaries. */
export type UberOrderSyncStatus = UberOrderStatus;
