import type { UberOrderStatus } from '../orders/uber-order.types';
import type { UberStoreScopedInput } from '../menu/uber-menu.types';

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
