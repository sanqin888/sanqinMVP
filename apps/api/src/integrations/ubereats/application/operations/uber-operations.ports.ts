import type {
  UberDomainJson,
  UberOperationsCountSummary,
  UberOpsTicket,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
  UberReconciliationReport,
} from './uber-operations.types';
import type { UberOrderStatus } from '../../domain/orders/uber-order.types';

export type UberReconciliationOrder = {
  status: UberOrderStatus;
  totalCents: number;
};
export interface UberOrderOperationsRepositoryPort {
  reconciliationOrders(
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<UberReconciliationOrder[]>;
  exists(externalOrderId: string): Promise<boolean>;
}
export interface UberMenuItemOperationsRepositoryPort {
  exists(stableId: string): Promise<boolean>;
}
export interface UberReconciliationRepositoryPort {
  countFailedSyncEvents(rangeStart: Date, rangeEnd: Date): Promise<number>;
  save(
    input: Omit<UberReconciliationReport, 'reportStableId' | 'createdAt'> & {
      storeId: string;
      syncedOrders: number;
      pendingOrders: number;
      payload: UberDomainJson;
    },
  ): Promise<Pick<UberReconciliationReport, 'reportStableId' | 'createdAt'>>;
  list(storeId: string, limit: number): Promise<UberReconciliationReport[]>;
  summary(storeId: string): Promise<UberOperationsCountSummary>;
}
export type UberOpsTicketRecord = UberOpsTicket & {
  description: string | null;
  externalOrderId: string | null;
  menuItemStableId: string | null;
  context: UberDomainJson | null;
  resolvedAt: Date | null;
};
export interface UberOpsTicketRepositoryPort {
  countOpen(storeId: string): Promise<number>;
  create(input: {
    storeId: string;
    type: UberOpsTicketType;
    priority: UberOpsTicketPriority;
    title: string;
    description?: string;
    externalOrderId?: string;
    menuItemStableId?: string;
    context: UberDomainJson;
  }): Promise<
    Pick<
      UberOpsTicketRecord,
      'ticketStableId' | 'status' | 'priority' | 'createdAt'
    >
  >;
  list(storeId: string, status?: UberOpsTicketStatus): Promise<UberOpsTicket[]>;
  summary(
    storeId: string,
    status?: UberOpsTicketStatus,
  ): Promise<UberOperationsCountSummary>;
  find(ticketStableId: string): Promise<UberOpsTicketRecord | null>;
  markInProgress(ticketStableId: string): Promise<void>;
  finishRetry(
    ticketStableId: string,
    error: string | null,
  ): Promise<
    Pick<
      UberOpsTicketRecord,
      'ticketStableId' | 'status' | 'retryCount' | 'lastError' | 'resolvedAt'
    >
  >;
}
export interface UberOperationsRepositoryScope {
  tickets: UberOpsTicketRepositoryPort;
}
export interface UberOperationsUnitOfWorkPort {
  transaction<T>(
    work: (scope: UberOperationsRepositoryScope) => Promise<T>,
  ): Promise<T>;
}
export const UBER_ORDER_OPERATIONS_REPOSITORY = Symbol(
  'UBER_ORDER_OPERATIONS_REPOSITORY',
);
export const UBER_MENU_ITEM_OPERATIONS_REPOSITORY = Symbol(
  'UBER_MENU_ITEM_OPERATIONS_REPOSITORY',
);
export const UBER_RECONCILIATION_REPOSITORY = Symbol(
  'UBER_RECONCILIATION_REPOSITORY',
);
export const UBER_OPS_TICKET_REPOSITORY = Symbol('UBER_OPS_TICKET_REPOSITORY');
export const UBER_OPERATIONS_UNIT_OF_WORK = Symbol(
  'UBER_OPERATIONS_UNIT_OF_WORK',
);
