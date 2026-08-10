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
  consumeOAuthState(input: {
    nonce: string;
    adminSessionId: string;
    issuedAt: Date;
    now: Date;
  }): Promise<boolean>;
}

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
