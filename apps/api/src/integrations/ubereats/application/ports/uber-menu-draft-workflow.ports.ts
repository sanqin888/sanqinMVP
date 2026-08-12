import type {
  UpdateDraftGroupInput,
  UpdateDraftItemInput,
  UpdateDraftOptionInput,
  UpsertOptionItemConfigInput,
  UpsertPriceBookItemInput,
} from '../../domain/menu/uber-menu.types';
import type {
  UberMenuGraphCategory,
  UberMenuGraphGroup,
  UberMenuGraphItem,
  UberMenuGraphSummary,
} from '../../domain/menu/uber-menu-graph.service';

export const UBER_MENU_CONFIG_QUERY_PORT = Symbol(
  'UBER_MENU_CONFIG_QUERY_PORT',
);
export const UBER_MENU_CONFIG_WRITE_PORT = Symbol(
  'UBER_MENU_CONFIG_WRITE_PORT',
);
export const UBER_MENU_DRAFT_READ_PORT = Symbol('UBER_MENU_DRAFT_READ_PORT');
export const UBER_MENU_DRAFT_MUTATION_PORT = Symbol(
  'UBER_MENU_DRAFT_MUTATION_PORT',
);
export const UBER_MENU_DRAFT_DIFF_PORT = Symbol('UBER_MENU_DRAFT_DIFF_PORT');
export const UBER_MENU_REFERENCE_QUERY_PORT = Symbol(
  'UBER_MENU_REFERENCE_QUERY_PORT',
);

export type UberMenuItemReference = { stableId: string };
export type UberOptionChoiceReference = { stableId: string };
export type UberProvisionedStoreMapping = {
  uberStoreId: string;
  rawPayload: unknown;
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

/** Persistence lookups deliberately contain no not-found business decisions. */
export interface UberMenuReferenceQueryPort {
  findMenuItemByStableId(
    stableId: string,
  ): Promise<UberMenuItemReference | null>;
  findOptionChoiceByStableId(
    stableId: string,
  ): Promise<UberOptionChoiceReference | null>;
  findProvisionedStoreMapping(
    storeId: string,
  ): Promise<UberProvisionedStoreMapping | null>;
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

export type UberMenuDraftEdgeDto = {
  from: string;
  to: string;
  type: string;
};

export type UberMenuDraftResult = {
  storeId: string;
  sourceMenu: {
    categories: number;
    items: number;
    optionItems: number;
    groups: number;
    tree: { categories: unknown[] };
  };
  uberDraft: {
    menuId: string;
    categories: UberMenuGraphCategory[];
    items: UberMenuGraphItem[];
    groups: UberMenuGraphGroup[];
    edges: UberMenuDraftEdgeDto[];
    tree: { categories: unknown[] };
    treeNodes: unknown[];
    optionMappings: unknown[];
  };
  mappingErrors: Array<{ code: string; message: string }>;
  validation: { warnings: unknown[]; errors: unknown[] };
  mappingWarnings: unknown[];
  publishSummary: UberMenuGraphSummary;
  serviceAvailability: unknown[];
  serviceAvailabilityTimezone: string;
  dirty: boolean;
  lastPublishedVersion: {
    versionStableId: string;
    status: string;
    createdAt: Date;
    totalItems: number;
    changedItems: number;
    errorMessage: string | null;
    errorDetails: unknown;
    finishedAt: Date | null;
  } | null;
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

export type UberMenuDraftDiffResult = {
  storeId: string;
  lastPublishedAt: Date | null;
  addedItems: string[];
  modifiedItems: Array<{
    sourceType: 'MENU_ITEM' | 'OPTION_ITEM';
    stableId: string;
    priceCents: number;
    isAvailable: boolean;
  }>;
  deletedItems: string[];
  addedGroups: string[];
  modifiedGroups: Array<{
    stableId: string;
    minSelect: number;
    maxSelect: number;
  }>;
  deletedGroups: string[];
  hierarchyChanges: UberMenuDraftEdgeDto[];
  deletedEdges: UberMenuDraftEdgeDto[];
  priceChanges: Array<{
    sourceType: 'MENU_ITEM' | 'OPTION_ITEM';
    stableId: string;
    priceCents: number;
  }>;
  availabilityChanges: Array<{
    sourceType: 'MENU_ITEM' | 'OPTION_ITEM';
    stableId: string;
    isAvailable: boolean;
  }>;
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

export interface UberMenuConfigWritePort {
  upsertUberItemChannelConfig(
    input: UpsertPriceBookItemInput,
  ): Promise<UberMenuConfigWriteResult<UberItemChannelConfigDto>>;
  upsertUberOptionItemConfig(
    input: UpsertOptionItemConfigInput,
  ): Promise<UberMenuConfigWriteResult<UberOptionItemConfigDto>>;
}

export interface UberMenuDraftReadPort {
  getUberMenuDraft(storeId?: string): Promise<UberMenuDraftResult>;
}

export interface UberMenuDraftMutationPort {
  updateUberDraftItem(
    id: string,
    input: UpdateDraftItemInput,
  ): Promise<UberDraftMutationResult<UberItemChannelConfigDto>>;
  updateUberDraftGroup(
    id: string,
    input: UpdateDraftGroupInput,
  ): Promise<UberDraftMutationResult<Record<string, unknown>>>;
  updateUberDraftOption(
    id: string,
    input: UpdateDraftOptionInput,
  ): Promise<UberDraftMutationResult<UberOptionItemConfigDto>>;
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
