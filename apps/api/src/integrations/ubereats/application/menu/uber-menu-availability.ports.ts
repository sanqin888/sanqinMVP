import type {
  SyncAvailabilityInput,
  SyncOptionAvailabilityInput,
  UberAvailabilitySyncResult,
} from '../../domain/menu/uber-menu.types';

export const UBER_MENU_AVAILABILITY_PORT = Symbol(
  'UBER_MENU_AVAILABILITY_PORT',
);
export interface UberMenuAvailabilityPort {
  syncUberMenuItemAvailability(
    input: SyncAvailabilityInput,
  ): Promise<UberAvailabilitySyncResult>;
  syncUberOptionItemAvailability(
    input: SyncOptionAvailabilityInput,
  ): Promise<UberAvailabilitySyncResult>;
}

export interface UberMenuAvailabilityQueryPort {
  isMenuItemPublishable(menuItemStableId: string): Promise<boolean>;
  findMenuItemSuspendUntil(menuItemStableId: string): Promise<Date | null>;
  findOptionSuspendUntil(optionChoiceStableId: string): Promise<Date | null>;
  findProvisionedStores(
    storeId?: string,
  ): Promise<Array<{ storeId: string; uberStoreId: string }>>;
}

export interface UberMenuAvailabilityCommandPort {
  setItemAvailability(
    storeId: string,
    menuItemStableId: string,
    isAvailable: boolean,
  ): Promise<void>;
  setOptionAvailability(
    storeId: string,
    uberStoreId: string,
    optionChoiceStableId: string,
    isAvailable: boolean,
  ): Promise<void>;
  createItemPublishFailure(input: {
    storeId: string;
    uberStoreId: string;
    menuItemStableId: string;
    isAvailable: boolean;
    error: string;
  }): Promise<void>;
}

export const UBER_MENU_AVAILABILITY_QUERY = Symbol(
  'UBER_MENU_AVAILABILITY_QUERY',
);
export const UBER_MENU_AVAILABILITY_COMMAND = Symbol(
  'UBER_MENU_AVAILABILITY_COMMAND',
);
