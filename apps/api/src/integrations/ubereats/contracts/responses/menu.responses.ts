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

export class UberMenuDraftResponse {
  storeId!: string | null;
  summary!: Record<string, unknown> | null;
  categories!: unknown[];
  items!: unknown[];
  groups!: unknown[];
  edges!: unknown[];
  contractVersion!: '2';
}

export class UberMenuDiffResponse {
  storeId!: string | null;
  addedItems!: unknown[];
  modifiedItems!: unknown[];
  deletedItems!: unknown[];
  addedGroups!: unknown[];
  modifiedGroups!: unknown[];
  deletedGroups!: unknown[];
  hierarchyChanges!: unknown[];
  contractVersion!: '2';
}
