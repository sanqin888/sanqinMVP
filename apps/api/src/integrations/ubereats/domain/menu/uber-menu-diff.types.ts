import type {
  UberMenuGraphCategory,
  UberMenuGraphGroup,
  UberMenuGraphItem,
  UberMenuGraphSummary,
} from './uber-menu-graph.service';

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
