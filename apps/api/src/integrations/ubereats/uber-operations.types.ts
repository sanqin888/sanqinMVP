import type {
  OrderStatus,
  Prisma,
  UberOpsTicketPriority,
  UberOpsTicketType,
} from '@prisma/client';
import type { UberStoreScopedInput } from './uber-menu.types';

export type OrderStatusSyncContext = { targetStatus: OrderStatus };
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
  context?: Prisma.JsonObject;
};
