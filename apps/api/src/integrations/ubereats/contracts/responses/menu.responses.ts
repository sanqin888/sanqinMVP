import type {
  UberListResponse,
  UberMutationResponse,
} from './ubereats.responses';

export class UberMenuItemResponse {
  menuItemStableId?: string;
  optionChoiceStableId?: string;
  priceCents?: number;
  priceDeltaCents?: number;
  isAvailable?: boolean;
  displayName?: string | null;
  displayDescription?: string | null;
  externalItemId?: string | null;
  externalCategoryId?: string | null;
  updatedAt?: string;
}

export type UberMenuListResponse = UberListResponse<UberMenuItemResponse> & {
  storeId: string | null;
};
export type UberMenuMutationResponse = UberMutationResponse;

export type UberMenuPublicJson =
  | string
  | number
  | boolean
  | null
  | UberMenuPublicJson[]
  | { [key: string]: UberMenuPublicJson };

export class UberMenuDraftResponse {
  storeId!: string | null;
  sourceMenu!: {
    categories: number;
    items: number;
    optionItems: number;
    groups: number;
    tree: { categories: UberMenuPublicJson[] };
  };
  uberDraft!: {
    menuId: string;
    categories: UberMenuPublicJson[];
    items: UberMenuPublicJson[];
    groups: UberMenuPublicJson[];
    edges: UberMenuPublicJson[];
    tree: { categories: UberMenuPublicJson[] };
    treeNodes: UberMenuPublicJson[];
    optionMappings: UberMenuPublicJson[];
  };
  mappingWarnings!: UberMenuPublicJson[];
  mappingErrors!: UberMenuPublicJson[];
  validation!: {
    warnings: UberMenuPublicJson[];
    errors: UberMenuPublicJson[];
  };
  publishSummary!: {
    totalItems: number;
    changedItems: number;
    totalCategories: number;
    totalModifierGroups: number;
  };
  serviceAvailability!: UberMenuPublicJson[];
  serviceAvailabilityTimezone!: string;
  dirty!: boolean;
  lastPublishedVersion!: {
    versionStableId: string;
    status: string;
    createdAt: string | null;
    totalItems: number;
    changedItems: number;
    errorMessage: string | null;
    errorDetails: UberMenuPublicJson;
    finishedAt: string | null;
  } | null;
  contractVersion!: '2';
}

export class UberMenuDiffResponse {
  storeId!: string | null;
  lastPublishedAt!: string | null;
  addedItems!: unknown[];
  modifiedItems!: unknown[];
  deletedItems!: unknown[];
  addedGroups!: unknown[];
  modifiedGroups!: unknown[];
  deletedGroups!: unknown[];
  hierarchyChanges!: unknown[];
  deletedEdges!: unknown[];
  priceChanges!: unknown[];
  availabilityChanges!: unknown[];
  contractVersion!: '2';
}
