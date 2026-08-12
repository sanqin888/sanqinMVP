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

export type UberEatsAvailabilitySyncResult = {
  status: 'PENDING' | 'FAILED' | 'SKIPPED_NOT_PUBLISHED';
  stores: Array<{
    storeId: string;
    uberStoreId?: string | null;
    status: 'PENDING' | 'FAILED' | 'SKIPPED_NOT_PUBLISHED';
    versionStableId?: string;
    error?: string;
  }>;
};

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

export type UberEatsOrderActionResult = {
  ok: boolean;
  id?: string;
  actionId?: string;
  status: string;
  retryable: boolean;
  duplicate?: boolean;
  lastError?: string | null;
};

export interface UberEatsOrderActionsPort {
  accept(externalOrderId: string): Promise<UberEatsOrderActionResult>;
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
  ): Promise<{ actionResult: UberEatsOrderActionResult }>;
}

export interface UberEatsStoreStatusSyncPort {
  syncStoreStatusToUber(): Promise<unknown>;
}
