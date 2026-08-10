import type { UberOrderStatus } from '../orders/uber-order.types';
import type { UberStoreScopedInput } from '../menu/uber-menu.types';

export type OrderStatusSyncContext = { targetStatus: UberOrderStatus };
export type UberOpsTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type UberOpsTicketType =
  | 'ORDER_STATUS_SYNC'
  | 'MENU_ITEM_AVAILABILITY'
  | 'STORE_STATUS_SYNC'
  | 'MENU_PUBLISH'
  | 'RECONCILIATION';
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
