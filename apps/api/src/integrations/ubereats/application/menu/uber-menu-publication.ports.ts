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
  imageUrl: string | null;
  isAvailable: boolean;
  modifierGroupStableIds: string[];
};

export type UberMenuSnapshotModifierOption = {
  stableId: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
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
  /** Receives an already resolved Uber store id; adapters must not infer POS semantics. */
  loadPublishSnapshot(
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

export type UberMenuPublicationLease = UberMenuPublicationAttempt & {
  leaseToken: string;
};

export interface UberMenuPublicationRepositoryPort {
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
  createAttempt(input: {
    storeId: string;
    uberStoreId: string;
    idempotencyKey: string;
    businessVersion: string;
    payloadHash: string;
    payload: UberMenuUploadPayload;
    totalItems: number;
  }): Promise<UberMenuPublicationAttempt>;
  markSubmitted(
    attemptId: string,
    input: { uberRequestId: string | null; uberResourceId: string | null },
  ): Promise<boolean>;
  markFailed(
    attemptId: string,
    input: { errorCode: string; errorMessage: string; retryable: boolean },
  ): Promise<boolean>;
  claimDueConfirmations(
    limit: number,
    lease: { owner: string; durationMs: number; now: Date },
  ): Promise<UberMenuPublicationLease[]>;
  markConfirmed(
    attemptId: string,
    leaseToken: string,
    input: {
      status: 'SUCCEEDED' | 'FAILED';
      uberRequestId: string | null;
      uberResourceId: string | null;
      errorCode: string | null;
      errorMessage: string | null;
    },
  ): Promise<boolean>;
  rescheduleConfirmation(
    attemptId: string,
    leaseToken: string,
    nextConfirmationAt: Date,
  ): Promise<boolean>;
  claimTimedOutConfirmations(
    cutoff: Date,
    limit: number,
    lease: { owner: string; durationMs: number; now: Date },
  ): Promise<UberMenuPublicationLease[]>;
  markConfirmationTimedOut(
    attemptId: string,
    leaseToken: string,
  ): Promise<boolean>;
}

export type UberMenuGatewayUploadResult = {
  uberRequestId: string | null;
  uberResourceId: string | null;
};

export interface UberMenuGatewayPort {
  uploadMenu(input: {
    storeId: string;
    payload: UberMenuUploadPayload;
    idempotencyKey: string;
  }): Promise<UberMenuGatewayUploadResult>;
  getMenuPublicationStatus(input: {
    storeId: string;
    uberResourceId: string;
  }): Promise<{
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
    uberRequestId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
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
