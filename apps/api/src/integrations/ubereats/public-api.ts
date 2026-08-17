/** Stable application boundary for callers outside the Uber Eats context. */
export const UBER_EATS_MENU_AVAILABILITY = Symbol(
  'UBER_EATS_MENU_AVAILABILITY',
);
export const UBER_EATS_ORDER_ACTIONS = Symbol('UBER_EATS_ORDER_ACTIONS');
export const UBER_EATS_ORDER_STATUS_SYNC = Symbol(
  'UBER_EATS_ORDER_STATUS_SYNC',
);
export const UBER_EATS_STORE_STATUS_SYNC = Symbol(
  'UBER_EATS_STORE_STATUS_SYNC',
);

export type {
  UberEatsAvailabilitySyncResult,
  UberEatsAvailabilitySyncStatus,
  UberEatsOrderActionResult,
  UberEatsOrderStatusSyncResult,
  UberEatsStoreStatusSyncResult,
  UberEatsSyncError,
} from './contracts/responses/cross-context.responses';

import type {
  UberEatsAvailabilitySyncResult,
  UberEatsOrderActionResult,
  UberEatsOrderStatusSyncResult,
  UberEatsStoreStatusSyncResult,
} from './contracts/responses/cross-context.responses';

export interface UberEatsMenuAvailabilityPort {
  syncUberMenuItemAvailability(input: {
    storeId?: string;
    menuItemStableId: string;
    isAvailable: boolean;
  }): Promise<UberEatsAvailabilitySyncResult>;
  syncUberOptionItemAvailability(input: {
    storeId?: string;
    optionChoiceStableId: string;
    isAvailable: boolean;
  }): Promise<UberEatsAvailabilitySyncResult>;
}

export interface UberEatsOrderActionsPort {
  accept(externalOrderId: string): Promise<UberEatsOrderActionResult>;
  cancel(
    externalOrderId: string,
    reason?: string,
  ): Promise<UberEatsOrderActionResult>;
  retryReadyForPickup(
    externalOrderId: string,
  ): Promise<UberEatsOrderActionResult>;
  getReadyForPickupAction(
    externalOrderId: string,
  ): Promise<UberEatsOrderActionResult | null>;
}

export interface UberEatsOrderStatusSyncPort {
  execute(
    externalOrderId: string,
    status: 'pending' | 'paid' | 'making' | 'ready' | 'completed' | 'cancelled',
  ): Promise<UberEatsOrderStatusSyncResult>;
}

export type UberEatsStoreStatusTarget = {
  uberStoreId: string;
  targetStatus: 'ONLINE' | 'PAUSED';
  reason?: string;
  pauseUntil?: string;
};

export interface UberEatsStoreStatusSyncPort {
  syncStoreStatusToUber(
    target?: UberEatsStoreStatusTarget,
  ): Promise<UberEatsStoreStatusSyncResult>;
}
