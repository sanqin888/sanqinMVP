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
export const UBER_MENU_WRITE_TRANSACTION_PORT = Symbol(
  'UBER_MENU_WRITE_TRANSACTION_PORT',
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
  posExternalStoreId: string;
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
  /**
   * Accepts either the POS/print-room id or the Uber store id, then returns the
   * provisioned mapping with the POS id as the canonical menu persistence scope.
   */
  resolveProvisionedUberStoreId(
    storeId: string,
  ): Promise<UberProvisionedStoreMapping | null>;
}
export interface UberBusinessScheduleQueryPort {
  readBusinessSchedule(): Promise<UberBusinessScheduleRecord | null>;
}

export type UberItemChannelConfigDto = {
  menuItemStableId: string;
  priceCents: number | null;
  isAvailable: boolean;
  displayName: string | null;
  displayDescription: string | null;
  preparationType: 'PREPARED' | 'PREPACKAGED' | null;
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
  preparationType: 'PREPARED' | 'PREPACKAGED' | null;
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

/**
 * The resource identity, rather than a transport request id, is the idempotency
 * boundary for menu configuration commands.  Consequently an equal payload is
 * a replay of the same desired state, while a different payload is an update.
 * Durable side effects use the same key plus the resulting state/action.
 */
export const UBER_MENU_COMMAND_IDEMPOTENCY = {
  samePayload: 'RETURN_SAME_BUSINESS_STATE',
  differentPayload: 'UPDATE_RESOURCE',
  sideEffects: 'DEDUPLICATE_BY_RESOURCE_AND_RESULTING_STATE',
  concurrency: 'CONVERGE_BY_UNIQUE_RESOURCE_KEY',
} as const;

export type UberItemConfigResourceKey = Readonly<{
  storeId: string;
  menuItemStableId: string;
}>;
export type UberOptionConfigResourceKey = Readonly<{
  storeId: string;
  optionChoiceStableId: string;
}>;
export type UberGroupConfigResourceKey = Readonly<{
  storeId: string;
  templateGroupStableId: string;
}>;

export type UberIdempotentCommand<TKey, TPayload> = Readonly<{
  resourceKey: TKey;
  payload: TPayload;
  semantics: typeof UBER_MENU_COMMAND_IDEMPOTENCY;
}>;

export type UberItemConfigCommand = UberIdempotentCommand<
  UberItemConfigResourceKey,
  UpsertPriceBookItemInput
>;
export type UberOptionConfigCommand = UberIdempotentCommand<
  UberOptionConfigResourceKey,
  UpsertOptionItemConfigInput
>;
export type UberGroupConfigCommand = UberIdempotentCommand<
  UberGroupConfigResourceKey,
  UpdateDraftGroupInput
>;
export type UberDraftMutationResult<TConfig> = {
  ok: boolean;
  storeId: string;
  config: TConfig;
  warnings: string[];
} & ({ itemId: string } | { groupId: string } | { optionItemId: string });

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
    command: UberItemConfigCommand,
  ): Promise<UberMenuConfigWriteResult<UberItemChannelConfigDto>>;
}
export interface UberOptionItemConfigCommandPort {
  upsertUberOptionItemConfig(
    command: UberOptionConfigCommand,
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
    command: UberGroupConfigCommand,
  ): Promise<UberDraftMutationResult<UberModifierGroupConfigDto>>;
}
export interface UberDraftOptionCommandPort {
  updateUberDraftOption(
    id: string,
    input: UpdateDraftOptionInput,
  ): Promise<UberDraftMutationResult<UberOptionItemConfigDto>>;
}
/**
 * Application-owned commit boundary for menu writes. Rejection from `work`
 * rolls back both the command write and its idempotent durable event record.
 *
 * `TCommands` deliberately lets each use case see only its required command.
 */
export interface UberMenuWriteTransactionPort<TCommands> {
  execute<T>(work: (commands: TCommands) => Promise<T>): Promise<T>;
}

export interface UberMenuDraftDiffPort {
  getUberMenuDraftDiff(storeId?: string): Promise<UberMenuDraftDiffResult>;
}
