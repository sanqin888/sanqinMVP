import type {
  UberOrderActionName,
  UberOrderStatus,
} from '../../domain/orders/uber-order.types';
import type { UberJsonValue } from './uber-persistence.ports';

export type UberOrderOutboxItem = {
  externalOrderId: string;
  action: UberOrderActionName;
  reasonCode: string | null;
  reasonDetail: string | null;
};

export interface UberOrderOutboxPort {
  enqueue(
    externalOrderId: string,
    action: UberOrderActionName,
    audit?: { reasonCode?: string; reasonDetail?: string },
  ): Promise<any>;
  claimDue(limit: number): Promise<UberOrderOutboxItem[]>;
  markSucceeded(externalOrderId: string, action: UberOrderActionName): Promise<void>;
  markFailed(
    externalOrderId: string,
    action: UberOrderActionName,
    error: unknown,
  ): Promise<void>;
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
  setStoreProvisioned(storeId: string, isProvisioned: boolean): Promise<boolean>;
}
export const UBER_WEBHOOK_INBOX_PORT = Symbol('UBER_WEBHOOK_INBOX_PORT');

export interface UberWebhookSignatureVerifier {
  verify(headers: Record<string, unknown>, rawBody: string | Buffer): void;
}
export const UBER_WEBHOOK_SIGNATURE_VERIFIER = Symbol(
  'UBER_WEBHOOK_SIGNATURE_VERIFIER',
);

export interface UberTelemetryPort {
  captureEvent(eventName: string, attributes?: Record<string, unknown>): Promise<void>;
  workflowLog(level: 'debug' | 'log' | 'warn' | 'error', message?: unknown): void;
}
export const UBER_TELEMETRY_PORT = Symbol('UBER_TELEMETRY_PORT');

/** Status accepted by application order synchronization boundaries. */
export type UberOrderSyncStatus = UberOrderStatus;
