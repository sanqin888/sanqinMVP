export type UberMenuItemDraft = {
  storeId: string;
  stableId: string;
  priceCents: number;
  isAvailable: boolean;
  displayName: string | null;
  displayDescription: string | null;
};

export type UberMenuOptionDraft = {
  storeId: string;
  stableId: string;
  priceDeltaCents: number;
  isAvailable: boolean;
  displayName: string | null;
  displayDescription: string | null;
};

export type UpdateUberMenuItemDraft = Partial<
  Pick<
    UberMenuItemDraft,
    'priceCents' | 'isAvailable' | 'displayName' | 'displayDescription'
  >
>;

export type UpdateUberMenuGroupDraft = {
  displayName?: string | null;
  minSelect?: number;
  maxSelect?: number;
  isActive?: boolean;
};

export type UpdateUberMenuOptionDraft = Partial<
  Pick<
    UberMenuOptionDraft,
    'priceDeltaCents' | 'isAvailable' | 'displayName' | 'displayDescription'
  >
>;

export type UberMenuDraftMutationResult = {
  entity: 'item' | 'group' | 'option';
  storeId: string;
  stableId: string;
  updated: true;
};

export const UBER_MENU_DRAFT_QUERY_PORT = Symbol('UBER_MENU_DRAFT_QUERY_PORT');
export const UBER_MENU_DRAFT_COMMAND_PORT = Symbol(
  'UBER_MENU_DRAFT_COMMAND_PORT',
);

export interface UberMenuDraftQueryPort {
  listItemConfigs(storeId: string): Promise<UberMenuItemDraft[]>;
  listOptionConfigs(storeId: string): Promise<UberMenuOptionDraft[]>;
}

export interface UberMenuDraftCommandPort {
  updateItem(
    storeId: string,
    stableId: string,
    changes: UpdateUberMenuItemDraft,
  ): Promise<void>;
  updateGroup(
    storeId: string,
    stableId: string,
    changes: UpdateUberMenuGroupDraft,
  ): Promise<void>;
  updateOption(
    storeId: string,
    stableId: string,
    changes: UpdateUberMenuOptionDraft,
  ): Promise<void>;
}
