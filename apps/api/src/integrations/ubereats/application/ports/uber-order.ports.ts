import type {
  ParsedUberOrder,
  UberOrderActionName,
  UberOrderStatus,
} from '../../domain/orders/uber-order.types';

export type UberOrderMenuMapping = {
  externalItemId: string;
  menuItemStableId: string;
  expectedPriceCents: number;
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

export interface UberOrderImportRepositoryPort {
  findMenuMappings(
    storeId: string,
    externalItemIds: string[],
  ): Promise<UberOrderMenuMapping[]>;
  findByExternalOrderId(externalOrderId: string): Promise<{
    orderId: string;
    status: UberOrderStatus;
    cursor: UberOrderEventCursor | null;
  } | null>;
  saveImportedOrder(input: {
    order: ParsedUberOrder;
    eventType: string;
    cursor: UberOrderEventCursor;
    menuMappings: UberOrderMenuMapping[];
    cancellation: UberOrderCancellationDecision | null;
    receivedAt: Date;
  }): Promise<{ orderId: string; created: boolean }>;
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

export interface UberOrderActionRepositoryPort {
  enqueue(input: Omit<UberOrderActionTask, 'taskId' | 'leaseToken'>): Promise<{
    taskId: string;
    created: boolean;
  }>;
  claim(input: {
    limit: number;
    owner: string;
    now: Date;
    leaseDurationMs: number;
  }): Promise<UberOrderActionTask[]>;
  markSucceeded(taskId: string, leaseToken: string): Promise<boolean>;
  markFailed(
    taskId: string,
    leaseToken: string,
    input: { retryable: boolean; code: string; message: string },
  ): Promise<boolean>;
}

export type UberOrderDenial = {
  reasonCode: string;
  reasonDetail: string | null;
};
export interface UberOrderActionGatewayPort {
  accept(input: {
    externalOrderId: string;
    idempotencyKey: string;
  }): Promise<void>;
  deny(input: {
    externalOrderId: string;
    idempotencyKey: string;
    denial: UberOrderDenial;
  }): Promise<void>;
  cancel(input: {
    externalOrderId: string;
    idempotencyKey: string;
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
export const UBER_ORDER_ACTION_COMMAND_GATEWAY = Symbol(
  'UBER_ORDER_ACTION_COMMAND_GATEWAY',
);
export const UBER_ORDER_STATUS_REPOSITORY = Symbol(
  'UBER_ORDER_STATUS_REPOSITORY',
);
export const UBER_ORDER_STATUS_GATEWAY = Symbol('UBER_ORDER_STATUS_GATEWAY');
export const UBER_ORDER_TRANSACTION = Symbol('UBER_ORDER_TRANSACTION');
