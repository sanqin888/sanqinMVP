/** JSON values are owned by the application boundary, not by Prisma. */
import type { UberWebhookInboxRecordV1 } from '../../contracts/events/uber-webhook-inbox-record.v1';

export type UberJsonValue =
  | string
  | number
  | boolean
  | null
  | UberJsonValue[]
  | { [key: string]: UberJsonValue };

export type UberWebhookInbox = Omit<
  UberWebhookInboxRecordV1<UberJsonValue>,
  'version' | 'eventType'
>;

export type UberOrderAction = {
  id: string;
  orderId: string;
  action: string;
  status: string;
  attemptCount: number;
  leaseUntil: Date | null;
  result: UberJsonValue | null;
};

export type UberMerchantConnection = {
  merchantUberUserId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  expiresAt: Date | null;
  connectedAt: Date;
};

export type UberStoreMapping = {
  uberStoreId: string;
  storeId: string | null;
  merchantUberUserId: string;
  posExternalStoreId: string | null;
  isProvisioned: boolean;
};

export type UberMenuPublishAttempt = {
  id: string;
  storeId: string;
  status: string;
  attemptNumber: number;
  payloadHash: string | null;
  error: UberJsonValue | null;
  createdAt: Date;
};

export type UberOperationsTicket = {
  id: string;
  storeId: string | null;
  type: string;
  status: string;
  priority: string;
  title: string;
  context: UberJsonValue | null;
};

export interface UberWebhookInboxPort {
  findInboxEvent(eventId: string): Promise<UberWebhookInbox | null>;
  saveInboxEvent(event: UberWebhookInbox): Promise<UberWebhookInbox>;
  markInboxProcessed(id: string, processedAt: Date): Promise<boolean>;
}

export interface UberOrderActionPort {
  findPendingAction(now: Date): Promise<UberOrderAction | null>;
  claimActionLease(id: string, now: Date, leaseUntil: Date): Promise<boolean>;
  saveActionResult(
    id: string,
    result: UberJsonValue | null,
    status: string,
  ): Promise<UberOrderAction>;
}

export interface UberMerchantConnectionPort {
  findMerchantConnection(id?: string): Promise<UberMerchantConnection | null>;
  saveMerchantConnection(
    connection: UberMerchantConnection,
  ): Promise<UberMerchantConnection>;
}

export interface UberStoreMappingPort {
  findStoreMapping(uberStoreId: string): Promise<UberStoreMapping | null>;
  saveStoreMapping(mapping: UberStoreMapping): Promise<UberStoreMapping>;
}

export interface UberOAuthStatePort {
  saveOAuthState(input: {
    nonce: string;
    adminSessionId: string;
    issuedAt: Date;
    expiresAt: Date;
    redirectUri: string;
    merchantContext: string | null;
  }): Promise<void>;
  findOAuthState(nonce: string): Promise<{
    nonce: string;
    adminSessionId: string;
    redirectUri: string;
    issuedAt: Date;
    expiresAt: Date;
    consumedAt: Date | null;
    merchantContext: string | null;
  } | null>;
  consumeOAuthState(input: {
    nonce: string;
    adminSessionId: string;
    issuedAt: Date;
    now: Date;
  }): Promise<boolean>;
}

/** Semantic persistence boundary used by the merchant workflows. */
export interface UberMerchantConnectionRepositoryPort {
  findConnection(merchantUberUserId?: string): Promise<{
    merchantUberUserId: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    scope: string | null;
    tokenType: string | null;
    connectedAt: Date;
    rawStoresSnapshot: unknown;
  } | null>;
  upsertConnection(input: {
    merchantUberUserId: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    scope: string | null;
    tokenType: string | null;
    connectedAt: Date;
    rawStoresSnapshot?: unknown;
  }): Promise<{ connectedAt: Date }>;
  saveStoresSnapshot(
    merchantUberUserId: string,
    raw: Record<string, unknown>,
  ): Promise<void>;
}

export type UberMerchantStoreMapping = {
  merchantUberUserId: string;
  uberStoreId: string;
  storeName: string | null;
  locationSummary: string | null;
  isProvisioned: boolean;
  provisionedAt: Date | null;
  posExternalStoreId: string | null;
  rawPayload?: unknown;
};
export interface UberStoreMappingRepositoryPort {
  findMappings(
    merchantUberUserId: string,
    uberStoreIds: string[],
  ): Promise<UberMerchantStoreMapping[]>;
  listMappings(): Promise<UberMerchantStoreMapping[]>;
  findMapping(uberStoreId: string): Promise<UberMerchantStoreMapping | null>;
  saveDiscovery(input: UberMerchantStoreMapping): Promise<void>;
  upsertMapping(
    input: UberMerchantStoreMapping,
  ): Promise<UberMerchantStoreMapping>;
  updatePosExternalStoreId(
    uberStoreId: string,
    posExternalStoreId: string,
  ): Promise<UberMerchantStoreMapping | null>;
}

export interface UberOperationsAlertRepositoryPort {
  getStoreStatusSource(): Promise<{
    isTemporarilyClosed: boolean;
    temporaryCloseReason: string | null;
  }>;
  recordStoreStatusResult(
    result: Record<string, unknown>,
    payload: Record<string, string>,
  ): Promise<void>;
  createStoreStatusAlert(
    uberStoreId: string,
    error: string,
    status: number,
    payload: Record<string, string>,
  ): Promise<void>;
}

export const UBER_OAUTH_STATE_REPOSITORY = Symbol(
  'UBER_OAUTH_STATE_REPOSITORY',
);
export const UBER_MERCHANT_CONNECTION_REPOSITORY = Symbol(
  'UBER_MERCHANT_CONNECTION_REPOSITORY',
);
export const UBER_STORE_MAPPING_REPOSITORY = Symbol(
  'UBER_STORE_MAPPING_REPOSITORY',
);
export const UBER_OPERATIONS_ALERT_REPOSITORY = Symbol(
  'UBER_OPERATIONS_ALERT_REPOSITORY',
);

export interface UberMenuPublishPort {
  findLatestPublishAttempt(
    storeId: string,
  ): Promise<UberMenuPublishAttempt | null>;
  savePublishAttempt(
    attempt: UberMenuPublishAttempt,
  ): Promise<UberMenuPublishAttempt>;
}

export interface UberOperationsTicketPort {
  findOperationsTicket(id: string): Promise<UberOperationsTicket | null>;
  saveOperationsTicket(
    ticket: UberOperationsTicket,
  ): Promise<UberOperationsTicket>;
}

export type UberRepositoryScope = {
  webhookInbox: UberWebhookInboxPort;
  orderActions: UberOrderActionPort;
  merchantConnections: UberMerchantConnectionPort;
  storeMappings: UberStoreMappingPort;
  oauthStates: UberOAuthStatePort;
  menuPublishes: UberMenuPublishPort;
  operationsTickets: UberOperationsTicketPort;
};

/** Application-owned transaction boundary; use cases never see a Prisma client. */
export interface UberUnitOfWork {
  transaction<T>(work: (scope: UberRepositoryScope) => Promise<T>): Promise<T>;
}

export const UBER_UNIT_OF_WORK = Symbol('UBER_UNIT_OF_WORK');
