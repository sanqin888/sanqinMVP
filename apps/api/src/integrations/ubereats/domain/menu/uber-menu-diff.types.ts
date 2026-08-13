import type {
  UberMenuGraphCategory,
  UberMenuGraphGroup,
  UberMenuGraphItem,
  UberMenuGraphSummary,
} from './uber-menu-graph.service';

export type UberMenuDraftJsonValue =
  | string
  | number
  | boolean
  | null
  | UberMenuDraftJsonValue[]
  | { [key: string]: UberMenuDraftJsonValue };

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
    tree: { categories: UberMenuDraftJsonValue[] };
  };
  uberDraft: {
    menuId: string;
    categories: UberMenuGraphCategory[];
    items: UberMenuGraphItem[];
    groups: UberMenuGraphGroup[];
    edges: UberMenuDraftEdgeDto[];
    tree: { categories: UberMenuDraftJsonValue[] };
    treeNodes: UberMenuDraftJsonValue[];
    optionMappings: UberMenuDraftJsonValue[];
  };
  mappingErrors: Array<{ code: string; message: string }>;
  validation: {
    warnings: UberMenuDraftJsonValue[];
    errors: UberMenuDraftJsonValue[];
  };
  mappingWarnings: UberMenuDraftJsonValue[];
  publishSummary: UberMenuGraphSummary;
  serviceAvailability: UberMenuDraftJsonValue[];
  serviceAvailabilityTimezone: string;
  dirty: boolean;
  lastPublishedVersion: {
    versionStableId: string;
    status: string;
    createdAt: Date;
    totalItems: number;
    changedItems: number;
    errorMessage: string | null;
    errorDetails: UberMenuDraftJsonValue;
    finishedAt: Date | null;
  } | null;
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
