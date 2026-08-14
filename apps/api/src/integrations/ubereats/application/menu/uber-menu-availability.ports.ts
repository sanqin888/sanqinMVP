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

export type UberAvailabilityItemConfig = {
  storeId: string;
  uberStoreId: string | null;
  externalItemId: string | null;
};

export interface UberMenuAvailabilityQueryPort {
  findItemConfigs(
    menuItemStableId: string,
    storeId?: string,
  ): Promise<UberAvailabilityItemConfig[]>;
  findProvisionedStores(
    storeId?: string,
  ): Promise<Array<{ uberStoreId: string }>>;
}

export interface UberMenuAvailabilityCommandPort {
  setItemAvailability(
    storeId: string,
    menuItemStableId: string,
    isAvailable: boolean,
  ): Promise<void>;
  setOptionAvailability(
    storeId: string,
    optionChoiceStableId: string,
    isAvailable: boolean,
  ): Promise<void>;
  createItemPublishFailure(input: {
    storeId: string;
    uberStoreId: string;
    menuItemStableId: string;
    externalItemId: string;
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
