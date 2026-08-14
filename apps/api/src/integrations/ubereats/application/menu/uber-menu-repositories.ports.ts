export type MenuSnapshot = {
  categories: Array<{ stableId: string; name: string; sortOrder: number }>;
  items: Array<{
    stableId: string;
    categoryStableId: string;
    name: string;
    priceCents: number;
    isAvailable: boolean;
  }>;
};

export type ItemChannelConfig = {
  storeId: string;
  stableId: string;
  priceCents: number;
  isAvailable: boolean;
  displayName: string | null;
  displayDescription: string | null;
};
export type ModifierConfig = {
  storeId: string;
  stableId: string;
  displayName: string | null;
  minSelect: number;
  maxSelect: number;
  isActive: boolean;
};
export type ModifierBinding = {
  storeId: string;
  parentOptionStableId: string;
  childGroupStableId: string;
  isBound: boolean;
};
export type BusinessSchedule = {
  timezone: string | null;
  salesTaxRate: number | null;
  hours: Array<{
    weekday: number;
    openMinutes: number | null;
    closeMinutes: number | null;
    isClosed: boolean;
  }>;
};
export type MenuStoreMapping = {
  uberStoreId: string;
  connectionId: string;
  posExternalStoreId: string | null;
  isProvisioned: boolean;
  timezone: string | null;
};

export interface MenuSnapshotRepository {
  load(): Promise<MenuSnapshot>;
}
export interface ItemChannelConfigRepository {
  list(storeId: string): Promise<ItemChannelConfig[]>;
}
export interface ModifierConfigRepository {
  list(storeId: string): Promise<ModifierConfig[]>;
}
export interface ModifierBindingRepository {
  list(storeId: string): Promise<ModifierBinding[]>;
}
export interface BusinessScheduleRepository {
  get(): Promise<BusinessSchedule>;
}
export interface MenuStoreMappingRepository {
  findByPosStoreId(storeId: string): Promise<MenuStoreMapping | null>;
}

export type UberMenuRepositoryScope = {
  snapshots: MenuSnapshotRepository;
  itemChannels: ItemChannelConfigRepository;
  modifiers: ModifierConfigRepository;
  bindings: ModifierBindingRepository;
  schedules: BusinessScheduleRepository;
  storeMappings: MenuStoreMappingRepository;
};
export interface UberMenuUnitOfWork {
  execute<T>(
    work: (repositories: UberMenuRepositoryScope) => Promise<T>,
  ): Promise<T>;
}
export const UBER_MENU_UNIT_OF_WORK = Symbol('UBER_MENU_UNIT_OF_WORK');
