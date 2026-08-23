import type { UberMenuGraphSummary } from './uber-menu-graph.service';

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

export type UberMenuDraftValidationIssue = {
  code: string;
  severity: 'ERROR' | 'WARNING';
  path: string;
  stableId: string | null;
  message: string;
};

type UberMenuDraftStableItem = {
  sourceType: 'MENU_ITEM' | 'OPTION_ITEM';
  stableId: string;
  priceCents: number;
  isAvailable: boolean;
  preparationType: 'PREPARED' | 'PREPACKAGED' | null;
  hasDelta: boolean;
};

type UberMenuDraftStableGroup = {
  stableId: string;
  minSelect: number;
  maxSelect: number;
  optionStableIds: string[];
};

type UberMenuDraftStableCategory = {
  stableId: string;
  itemStableIds: string[];
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
    /** Internal stable-id projections used by diff; the API presenter does not expose these arrays. */
    categories: UberMenuDraftStableCategory[];
    items: UberMenuDraftStableItem[];
    groups: UberMenuDraftStableGroup[];
    edges: UberMenuDraftEdgeDto[];
    tree: { categories: UberMenuDraftJsonValue[] };
    treeNodes: UberMenuDraftJsonValue[];
    optionMappings: UberMenuDraftJsonValue[];
  };
  mappingErrors: Array<{ code: string; stableId: string; message: string }>;
  validation: {
    warnings: UberMenuDraftValidationIssue[];
    errors: UberMenuDraftValidationIssue[];
  };
  mappingWarnings: UberMenuDraftValidationIssue[];
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
  preparationTypeChanges: Array<{
    sourceType: 'MENU_ITEM' | 'OPTION_ITEM';
    stableId: string;
    preparationType: 'PREPARED' | 'PREPACKAGED' | null;
  }>;
};
