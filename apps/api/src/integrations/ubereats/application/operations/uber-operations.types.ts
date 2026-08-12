import type { UberStoreScopedInput } from '../../domain/menu/uber-menu.types';
import type { UberOrderStatus } from '../../domain/orders/uber-order.types';

export type OrderStatusSyncContext = { targetStatus: UberOrderStatus };
export const UberOpsTicketPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type UberOpsTicketPriority =
  (typeof UberOpsTicketPriority)[keyof typeof UberOpsTicketPriority];
export const UberOpsTicketType = {
  ORDER_STATUS_SYNC: 'ORDER_STATUS_SYNC',
  MENU_ITEM_AVAILABILITY: 'MENU_ITEM_AVAILABILITY',
  STORE_STATUS_SYNC: 'STORE_STATUS_SYNC',
  MENU_PUBLISH: 'MENU_PUBLISH',
  RECONCILIATION: 'RECONCILIATION',
} as const;
export type UberOpsTicketType =
  (typeof UberOpsTicketType)[keyof typeof UberOpsTicketType];
export const UberOpsTicketStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  IGNORED: 'IGNORED',
} as const;
export type UberOpsTicketStatus =
  (typeof UberOpsTicketStatus)[keyof typeof UberOpsTicketStatus];
export type UberDomainJson =
  | string
  | number
  | boolean
  | null
  | UberDomainJson[]
  | { [key: string]: UberDomainJson };
export type MenuItemAvailabilityContext = { isAvailable: boolean };
export type StoreStatusSyncContext = {
  uberStoreId: string;
  targetStatus: 'ONLINE' | 'PAUSED';
  reason?: string;
  pauseUntil?: string;
};
export type MenuPublishContext = {
  versionId?: string;
  publish: {
    storeId: string;
    dryRun: false;
    timezoneConfirmed?: boolean;
    taxRateConfirmed?: boolean;
    excludedCategoryIds?: string[];
    excludedGroupIds?: string[];
    excludedMenuItemStableIds?: string[];
    excludedOptionChoiceStableIds?: string[];
  };
};

export type GenerateReconciliationReportInput = UberStoreScopedInput & {
  rangeStart?: string;
  rangeEnd?: string;
};

export type CreateOpsTicketInput = {
  storeId?: string;
  type: UberOpsTicketType;
  title: string;
  description?: string;
  priority?: UberOpsTicketPriority;
  externalOrderId?: string;
  menuItemStableId?: string;
  context?: { [key: string]: UberDomainJson };
};

/** Stable application-facing reconciliation totals. */
export type UberReconciliationSummary = {
  totalOrders: number;
  totalAmountCents: number;
  syncedOrders: number;
  pendingOrders: number;
  failedSyncEvents: number;
  discrepancyOrders: number;
};

export type UberReconciliationReport = UberReconciliationSummary & {
  reportStableId: string;
  rangeStart: Date;
  rangeEnd: Date;
  createdAt: Date;
};

export type UberOpsTicket = {
  ticketStableId: string;
  storeId: string;
  type: UberOpsTicketType;
  status: UberOpsTicketStatus;
  priority: UberOpsTicketPriority;
  title: string;
  externalOrderId: string | null;
  menuItemStableId: string | null;
  retryCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UberPage<T> = {
  storeId: string;
  count: number;
  items: T[];
};

export type UberOperationsCountSummary = {
  count: number;
  updatedAt: Date | null;
};

export type UberReconciliationReportResult = UberReconciliationReport & {
  ok: true;
  storeId: string;
};

export type UberOpsTicketCreated = Pick<
  UberOpsTicket,
  'ticketStableId' | 'status' | 'priority' | 'createdAt'
> & { ok: true; storeId: string };

export type UberOpsTicketRetryResult = Pick<
  UberOpsTicket,
  'ticketStableId' | 'status' | 'retryCount' | 'lastError'
> & { ok: boolean; resolvedAt: Date | null };
