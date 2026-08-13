import type {
  UpdateDraftGroupInput,
  UpdateDraftItemInput,
  UpdateDraftOptionInput,
  UpsertOptionItemConfigInput,
  UpsertPriceBookItemInput,
} from '../../domain/menu/uber-menu.types';
import type {
  UberMenuDraftDiffResult,
  UberMenuDraftResult,
} from '../../domain/menu/uber-menu-diff.types';

export type {
  UberMenuDraftDiffResult,
  UberMenuDraftEdgeDto,
  UberMenuDraftResult,
} from '../../domain/menu/uber-menu-diff.types';

export const UBER_MENU_CONFIG_QUERY_PORT = Symbol(
  'UBER_MENU_CONFIG_QUERY_PORT',
);
export const UBER_ITEM_CHANNEL_CONFIG_COMMAND_PORT = Symbol(
  'UBER_ITEM_CHANNEL_CONFIG_COMMAND_PORT',
);
export const UBER_OPTION_ITEM_CONFIG_COMMAND_PORT = Symbol(
  'UBER_OPTION_ITEM_CONFIG_COMMAND_PORT',
);
export const UBER_MENU_DRAFT_READ_PORT = Symbol('UBER_MENU_DRAFT_READ_PORT');
export const UBER_DRAFT_ITEM_COMMAND_PORT = Symbol(
  'UBER_DRAFT_ITEM_COMMAND_PORT',
);
export const UBER_DRAFT_GROUP_COMMAND_PORT = Symbol(
  'UBER_DRAFT_GROUP_COMMAND_PORT',
);
export const UBER_DRAFT_OPTION_COMMAND_PORT = Symbol(
  'UBER_DRAFT_OPTION_COMMAND_PORT',
);
export const UBER_OPTION_CHILD_GROUP_BINDING_COMMAND_PORT = Symbol(
  'UBER_OPTION_CHILD_GROUP_BINDING_COMMAND_PORT',
);
export const UBER_MENU_DRAFT_DIFF_PORT = Symbol('UBER_MENU_DRAFT_DIFF_PORT');
export const MENU_ITEM_EXISTENCE_QUERY_PORT = Symbol(
  'MENU_ITEM_EXISTENCE_QUERY_PORT',
);
export const OPTION_CHOICE_EXISTENCE_QUERY_PORT = Symbol(
  'OPTION_CHOICE_EXISTENCE_QUERY_PORT',
);
export const PROVISIONED_UBER_STORE_QUERY_PORT = Symbol(
  'PROVISIONED_UBER_STORE_QUERY_PORT',
);
export const UBER_BUSINESS_SCHEDULE_QUERY_PORT = Symbol(
  'UBER_BUSINESS_SCHEDULE_QUERY_PORT',
);

export type UberProvisionedStoreMapping = {
  uberStoreId: string;
};
export type UberBusinessScheduleRecord = {
  timezone: string | null;
  salesTaxRate: number | null;
  hours: Array<{
    weekday: number;
    openMinutes: number | null;
    closeMinutes: number | null;
    isClosed: boolean;
  }>;
};

export interface MenuItemExistenceQueryPort {
  menuItemExists(stableId: string): Promise<boolean>;
}
export interface OptionChoiceExistenceQueryPort {
  optionChoiceExists(stableId: string): Promise<boolean>;
}
export interface ProvisionedUberStoreQueryPort {
  resolveProvisionedStore(
    storeId: string,
  ): Promise<UberProvisionedStoreMapping | null>;
}
export interface UberBusinessScheduleQueryPort {
  readBusinessSchedule(): Promise<UberBusinessScheduleRecord | null>;
}

export type UberItemChannelConfigDto = {
  menuItemStableId: string;
  priceCents: number;
  isAvailable: boolean;
  displayName: string | null;
  displayDescription: string | null;
  externalItemId: string | null;
  externalCategoryId: string | null;
  lastPublishedAt: Date | null;
  lastPublishError: string | null;
  updatedAt: Date;
};
export type UberOptionItemConfigDto = {
  optionChoiceStableId: string;
  priceDeltaCents: number;
  isAvailable: boolean;
  displayName: string | null;
  displayDescription: string | null;
  externalItemId: string | null;
  lastPublishedAt: Date | null;
  lastPublishError: string | null;
  updatedAt: Date;
};
export type UberModifierGroupConfigDto = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  storeId: string;
  templateGroupStableId: string;
  minSelect: number;
  maxSelect: number;
  displayName: string | null;
  uberStoreId: string | null;
  lastPublishedAt: Date | null;
  lastPublishError: string | null;
  externalModifierGroupId: string | null;
};
export type UberPublishedMenuItemDto = {
  publishVersionId: string;
  uberStoreId: string;
  uberItemId: string;
  menuItemStableId: string;
  publishedPriceCents: number;
  publishedIsAvailable: boolean;
  publishedName: string;
  publishedAt: Date;
  publishVersion: { versionStableId: string; status: string };
};
export type UberMenuConfigListResult<T> = {
  storeId: string;
  count: number;
  items: T[];
};
export type UberMenuConfigWriteResult<T> = {
  ok: boolean;
  storeId: string;
  item: T;
};
export type UberDraftMutationResult<TConfig> = {
  ok: boolean;
  storeId: string;
  config: TConfig;
  warnings: string[];
} & ({ itemId: string } | { groupId: string } | { optionItemId: string });
export type UberDraftBindingResult = {
  ok: boolean;
  storeId: string;
  optionItemId: string;
  groupId: string;
  deletedCount?: number;
};

export interface UberMenuConfigQueryPort {
  listUberItemChannelConfigs(
    storeId?: string,
  ): Promise<UberMenuConfigListResult<UberItemChannelConfigDto>>;
  listUberPublishedMenuItems(
    storeId?: string,
  ): Promise<UberMenuConfigListResult<UberPublishedMenuItemDto>>;
  listUberOptionItemConfigs(
    storeId?: string,
  ): Promise<UberMenuConfigListResult<UberOptionItemConfigDto>>;
}
export interface UberItemChannelConfigCommandPort {
  upsertUberItemChannelConfig(
    input: UpsertPriceBookItemInput,
  ): Promise<UberMenuConfigWriteResult<UberItemChannelConfigDto>>;
}
export interface UberOptionItemConfigCommandPort {
  upsertUberOptionItemConfig(
    input: UpsertOptionItemConfigInput,
  ): Promise<UberMenuConfigWriteResult<UberOptionItemConfigDto>>;
}
export interface UberMenuDraftReadPort {
  getUberMenuDraft(storeId?: string): Promise<UberMenuDraftResult>;
}
export interface UberDraftItemCommandPort {
  updateUberDraftItem(
    id: string,
    input: UpdateDraftItemInput,
  ): Promise<UberDraftMutationResult<UberItemChannelConfigDto>>;
}
export interface UberDraftGroupCommandPort {
  updateUberDraftGroup(
    id: string,
    input: UpdateDraftGroupInput,
  ): Promise<UberDraftMutationResult<UberModifierGroupConfigDto>>;
}
export interface UberDraftOptionCommandPort {
  updateUberDraftOption(
    id: string,
    input: UpdateDraftOptionInput,
  ): Promise<UberDraftMutationResult<UberOptionItemConfigDto>>;
}
export interface UberOptionChildGroupBindingCommandPort {
  bindUberDraftOptionChildGroup(
    optionId: string,
    childGroupId: string,
    storeId?: string,
  ): Promise<UberDraftBindingResult>;
  unbindUberDraftOptionChildGroup(
    optionId: string,
    childGroupId: string,
    storeId?: string,
  ): Promise<UberDraftBindingResult>;
}
export interface UberMenuDraftDiffPort {
  getUberMenuDraftDiff(storeId?: string): Promise<UberMenuDraftDiffResult>;
}
