import type { UberMenuUploadPayload } from '../../domain/menu/uber-menu.types';
import type { PublishMenuInput } from '../../domain/menu/uber-menu.types';

export interface UberMenuPublishCommandPort {
  execute(input: PublishMenuInput): Promise<{ versionStableId?: string }>;
}
export interface UberPublicBaseUrlPort {
  readonly publicBaseUrl: string;
}
export const UBER_PUBLIC_BASE_URL = Symbol('UBER_PUBLIC_BASE_URL');
export const UBER_MENU_PUBLISH_COMMAND = Symbol('UBER_MENU_PUBLISH_COMMAND');

export type UberMenuSnapshotItem = {
  stableId: string;
  categoryStableId: string;
  name: string;
  description: string | null;
  priceCents: number;
  sourcePriceCents: number;
  overridePriceCents: number | null;
  priceValueSource: 'UBER_OVERRIDE' | 'SANQ_SOURCE';
  imageUrl: string | null;
  isAvailable: boolean;
  suspendUntilEpochSeconds: number | null;
  preparationType: 'PREPARED' | 'PREPACKAGED' | null;
  modifierGroupStableIds: string[];
};

export type UberMenuSnapshotModifierOption = {
  stableId: string;
  name: string;
  priceDeltaCents: number;
  sourcePriceDeltaCents: number;
  overridePriceDeltaCents: number | null;
  priceValueSource: 'UBER_OVERRIDE' | 'SANQ_SOURCE';
  isAvailable: boolean;
  suspendUntilEpochSeconds: number | null;
  preparationType: 'PREPARED' | 'PREPACKAGED' | null;
  childGroupStableIds: string[];
};

export type UberMenuPublishSnapshot = {
  storeId: string;
  uberStoreId: string;
  timezone: string;
  taxRate: number;
  categories: Array<{
    stableId: string;
    name: string;
    itemStableIds: string[];
  }>;
  items: UberMenuSnapshotItem[];
  modifierGroups: Array<{
    stableId: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    optionStableIds: string[];
  }>;
  modifierOptions: UberMenuSnapshotModifierOption[];
};

export interface UberMenuSnapshotRepositoryPort {
  loadPublishSnapshot(
    posStoreId: string,
    uberStoreId: string,
  ): Promise<UberMenuPublishSnapshot | null>;
}

export type UberMenuPublicationStatus =
  | 'CREATED'
  | 'SUBMITTED'
  | 'SUCCEEDED'
  | 'FAILED';

export type UberMenuPublicationAttempt = {
  attemptId: string;
  storeId: string;
  idempotencyKey: string;
  businessVersion: string;
  status: UberMenuPublicationStatus;
  uberRequestId: string | null;
  uberResourceId: string | null;
};

export type UberPublishedMenuItemSnapshot = {
  uberItemId: string;
  menuItemStableId: string;
  publishedPriceCents: number;
  publishedIsAvailable: boolean;
  publishedName: string;
};

export interface UberMenuPublicationRepositoryPort {
  findLastSucceededPayload(
    storeId: string,
  ): Promise<UberMenuUploadPayload | null>;
  listIntentionalPriceRestores(storeId: string): Promise<Set<string>>;
  recordCriticalRiskAcknowledgement(input: {
    storeId: string;
    payloadHash: string;
    criticalCount: number;
  }): Promise<void>;
  markPublishVersionSucceeded(
    attemptId: string,
    responsePayload: Record<string, unknown>,
  ): Promise<void>;
  markPublishVersionFailed(
    attemptId: string,
    errorMessage: string,
    errors?: Array<Record<string, unknown>>,
  ): Promise<void>;
  findSucceededAttempt(
    idempotencyKey: string,
  ): Promise<UberMenuPublicationAttempt | null>;
  /** Creates a logical attempt or rearms its existing FAILED idempotent record. */
  createAttempt(input: {
    storeId: string;
    uberStoreId: string;
    idempotencyKey: string;
    businessVersion: string;
    payloadHash: string;
    payload: UberMenuUploadPayload;
    totalItems: number;
    publishedItems: UberPublishedMenuItemSnapshot[];
  }): Promise<UberMenuPublicationAttempt>;
  markFailed(
    attemptId: string,
    input: {
      errorCode: string;
      errorMessage: string;
      retryable: boolean;
      upstreamStatus: number | null;
      upstreamDetail: string | null;
    },
  ): Promise<boolean>;
}

export type UberRetrievedMenuItem = {
  id: string;
  priceCents: number;
  isAvailable: boolean;
  modifierGroupIds: string[];
  taxRatePercentage: number | null;
  taxLabels: string[];
  preparationType: '' | 'PREPACKAGED' | null;
};

export type UberRetrievedMenuModifierGroup = {
  id: string;
  optionItemIds: string[];
};

export type UberRetrievedMenu = {
  storeId: string;
  menuIds: string[];
  categoryIds: string[];
  items: UberRetrievedMenuItem[];
  modifierGroups: UberRetrievedMenuModifierGroup[];
  disableItemInstructions: boolean | null;
};

export interface UberMenuGatewayPort {
  retrieveMenu(storeId: string): Promise<UberRetrievedMenu>;
  uploadMenu(input: {
    storeId: string;
    payload: UberMenuUploadPayload;
    idempotencyKey: string;
  }): Promise<void>;
  updateItemAvailability(input: {
    storeId: string;
    itemId: string;
    isAvailable: boolean;
    suspendUntilEpochSeconds?: number | null;
    idempotencyKey: string;
  }): Promise<void>;
}

export type UberMenuImage = { itemStableId: string; url: string };
export interface UberMenuImageProbePort {
  validateImages(images: UberMenuImage[]): Promise<{
    valid: boolean;
    failures: Array<{
      itemStableId: string;
      url: string;
      code: string;
      message: string;
    }>;
  }>;
}

export const UBER_MENU_SNAPSHOT_REPOSITORY = Symbol(
  'UBER_MENU_SNAPSHOT_REPOSITORY',
);
export const UBER_MENU_PUBLICATION_REPOSITORY = Symbol(
  'UBER_MENU_PUBLICATION_REPOSITORY',
);
export const UBER_MENU_GATEWAY = Symbol('UBER_MENU_GATEWAY');
export const UBER_MENU_IMAGE_PROBE = Symbol('UBER_MENU_IMAGE_PROBE');
