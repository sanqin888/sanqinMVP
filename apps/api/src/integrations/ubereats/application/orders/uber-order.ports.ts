import type {
  ParsedUberOrder,
  UberFulfillmentTiming,
  UberOrderActionName,
  UberOrderStatus,
} from '../../domain/orders/uber-order.types';
import type { UberOrderNotificationEventV1 } from '../../domain/webhook/uber-webhook-event.parser';
import type { UberEventOrdering } from './uber-order-processing.ports';

export type UberOrderMenuMapping = {
  externalItemId: string;
  menuItemStableId: string;
  expectedPriceCents: number;
};

export type UberStoreAllergyPolicy = {
  mode: 'RELAY_ALL' | 'DENY_LIST' | 'DENY_ALL';
  unsupportedAllergens: string[];
};

export type UberOrderCancellationDecision = {
  kind: 'CANCELLED' | 'REJECTED';
  cancelledBy: string | null;
  reasonCode: string | null;
  reasonDetail: string | null;
  occurredAt: Date;
};

export type UberOrderEventCursor = {
  eventId: string;
  occurredAt: Date | null;
  resourceVersion: string | null;
  sequence: number | null;
};

/** Durable command written in the same transaction as the imported order. */
export type UberOrderActionIntent<
  TAction extends UberOrderActionName = UberOrderActionName,
> = {
  externalOrderId: string;
  action: TAction;
  idempotencyKey: string;
  businessVersion: string;
  reasonCode: string | null;
  reasonDetail: string | null;
};

export type UberOrderImportActionIntent = UberOrderActionIntent<
  Extract<UberOrderActionName, 'ACCEPT' | 'DENY'>
>;

export interface UberOrderImportRepositoryPort {
  findMenuMappings(
    uberStoreId: string,
    externalItemIds: string[],
  ): Promise<UberOrderMenuMapping[]>;
  findByExternalOrderId(externalOrderId: string): Promise<{
    orderId: string;
    status: UberOrderStatus;
    cursor: UberOrderEventCursor | null;
    /** Present on the Prisma adapter; optional keeps older test doubles compatible. */
    fulfillmentTiming?: UberFulfillmentTiming;
  } | null>;
  /** Standalone admission DENY creates no local Order; failure webhook may arrive afterward. */
  hasSucceededDenial?(externalOrderId: string): Promise<boolean>;
  getPosStoreConnectivity?(posStoreId: string): Promise<{
    status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
    lastHeartbeatAt: Date | null;
  }>;
  getStoreAllergyPolicy?(posStoreId: string): Promise<UberStoreAllergyPolicy>;
  saveExistingOrderCancellation(input: {
    orderId: string;
    externalOrderId: string;
    cursor: UberOrderEventCursor;
    cancellation: UberOrderCancellationDecision;
  }): Promise<void>;
  saveImportedOrder(input: {
    order: ParsedUberOrder;
    posStoreId: string;
    eventType: string;
    cursor: UberOrderEventCursor;
    menuMappings: UberOrderMenuMapping[];
    cancellation: UberOrderCancellationDecision | null;
    actionIntent: UberOrderImportActionIntent | null;
    receivedAt: Date;
  }): Promise<{
    orderId: string;
    created: boolean;
    action: { taskId: string; created: boolean } | null;
  }>;
}

export type UberOrderActionTask = {
  taskId: string;
  leaseToken: string;
  externalOrderId: string;
  action: UberOrderActionName;
  idempotencyKey: string;
  businessVersion: string;
  reasonCode: string | null;
  reasonDetail: string | null;
};

type UberOrderActionEnqueueInput = Omit<
  UberOrderActionTask,
  'taskId' | 'leaseToken'
>;

export type UberOrderActionContext = {
  status: UberOrderStatus;
  totalCents: number;
  referenceAt: Date;
  /** Optional only for backward-compatible test/adapter implementations. */
  fulfillmentTiming?: UberFulfillmentTiming;
  scheduledReadyAt?: Date | null;
  /** Uber-provided kitchen-ready estimate; null when SanQ only has a schedule target. */
  externalEstimatedReadyAt?: Date | null;
};

export type UberOrderSafeErrorBody =
  | string
  | number
  | boolean
  | null
  | UberOrderSafeErrorBody[]
  | { [key: string]: UberOrderSafeErrorBody };

export interface UberOrderActionRepositoryPort {
  enqueue(input: UberOrderActionEnqueueInput): Promise<{
    taskId: string;
    created: boolean;
  }>;
  /**
   * Reopens the existing externalOrderId + action row for a new business phase.
   * The caller must supply a distinct idempotency key for that phase.
   */
  requeue(input: UberOrderActionEnqueueInput): Promise<{
    taskId: string;
    created: boolean;
  }>;
  claim(input: {
    limit: number;
    owner: string;
    now: Date;
    leaseDurationMs: number;
  }): Promise<UberOrderActionTask[]>;
  getOrderContext(
    externalOrderId: string,
  ): Promise<UberOrderActionContext | null>;
  complete(input: {
    taskId: string;
    leaseToken: string;
    upstreamStatus?: number | null;
    transition: {
      from: UberOrderStatus;
      to: UberOrderStatus;
    } | null;
  }): Promise<boolean>;
  markFailed(
    taskId: string,
    leaseToken: string,
    input: {
      retryable: boolean;
      code: string;
      message: string;
      upstreamStatus?: number | null;
      responseBody?: UberOrderSafeErrorBody | null;
    },
  ): Promise<boolean>;
}

export type UberOrderDenial = {
  reasonCode: string;
  reasonDetail: string | null;
};

/** Minimal upstream failure facts. Retry policy deliberately lives in the service. */
export interface UberOrderCommandFailure extends Error {
  status: number | null;
  code?: string;
  retryAfterMs?: number | null;
  responseBody?: UberOrderSafeErrorBody | null;
}

export interface UberOrderActionGatewayPort {
  accept(input: {
    externalOrderId: string;
    idempotencyKey: string;
    readyForPickupAt?: Date;
  }): Promise<void>;
  deny(input: {
    externalOrderId: string;
    idempotencyKey: string;
    denial: UberOrderDenial;
  }): Promise<void>;
  cancel(input: {
    externalOrderId: string;
    idempotencyKey: string;
    denial?: UberOrderDenial;
  }): Promise<void>;
  readyForPickup(input: {
    externalOrderId: string;
    idempotencyKey: string;
  }): Promise<void>;
}

export interface UberOrderStatusRepositoryPort {
  getStatus(externalOrderId: string): Promise<UberOrderStatus | null>;
  recordTransition(input: {
    externalOrderId: string;
    from: UberOrderStatus;
    to: UberOrderStatus;
    eventId: string;
    occurredAt: Date;
  }): Promise<boolean>;
}

export interface UberOrderStatusGatewayPort {
  syncStatus(input: {
    externalOrderId: string;
    status: UberOrderStatus;
    idempotencyKey: string;
  }): Promise<void>;
}

export interface UberOrderTransactionPort {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export const UBER_ORDER_IMPORT_REPOSITORY = Symbol(
  'UBER_ORDER_IMPORT_REPOSITORY',
);
export const UBER_ORDER_ACTION_REPOSITORY = Symbol(
  'UBER_ORDER_ACTION_REPOSITORY',
);
/** The single outbound boundary for business-semantic order commands. */
export const UBER_ORDER_ACTION_GATEWAY = Symbol('UBER_ORDER_ACTION_GATEWAY');
export const UBER_ORDER_STATUS_REPOSITORY = Symbol(
  'UBER_ORDER_STATUS_REPOSITORY',
);
export const UBER_ORDER_STATUS_GATEWAY = Symbol('UBER_ORDER_STATUS_GATEWAY');
export const UBER_ORDER_TRANSACTION = Symbol('UBER_ORDER_TRANSACTION');

export const UBER_ORDER_IMPORT_PORT = Symbol('UBER_ORDER_IMPORT_PORT');
export interface UberOrderImportPort {
  processWebhookEvent(
    eventType: string,
    eventId: string,
    payload: UberOrderNotificationEventV1,
    ordering?: UberEventOrdering,
  ): Promise<void>;
}
