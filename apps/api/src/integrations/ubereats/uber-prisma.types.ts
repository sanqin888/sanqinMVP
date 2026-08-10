import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Narrow, structurally typed persistence ports for the Uber integration.
 *
 * Production passes the generated Prisma delegates. Unit tests can pass small
 * object fakes implementing only the operations exercised by the use case.
 */
export type UberWebhookInboxRepository = Pick<
  PrismaService['uberWebhookInbox'],
  'create' | 'findUnique' | 'updateMany' | 'upsert'
>;

export type UberOrderActionRepository = Pick<
  PrismaService['uberOrderAction'],
  'findUnique' | 'create' | 'update' | 'upsert' | 'findMany'
>;

export type UberMerchantConnectionRepository = Pick<
  PrismaService['uberMerchantConnection'],
  'findUnique' | 'findFirst' | 'upsert' | 'update'
>;

export type UberStoreMappingRepository = Pick<
  PrismaService['uberStoreMapping'],
  'findUnique' | 'findFirst' | 'findMany' | 'upsert' | 'updateMany' | 'update'
>;

export type UberMenuPublishRepository = Pick<
  PrismaService['uberMenuPublishVersion'],
  'create' | 'findFirst' | 'findMany' | 'findUnique' | 'update' | 'updateMany'
>;

export type UberOpsTicketRepository = Pick<
  PrismaService['uberOpsTicket'],
  'count' | 'create' | 'findFirst' | 'findMany' | 'findUnique' | 'update'
>;

export type UberOAuthStateRepository = Pick<
  PrismaService['uberOAuthStateRequest'],
  'create' | 'findUnique' | 'updateMany' | 'deleteMany'
>;

export interface UberPrismaRepositories {
  uberWebhookInbox: UberWebhookInboxRepository;
  uberOrderAction: UberOrderActionRepository;
  uberMerchantConnection: UberMerchantConnectionRepository;
  uberStoreMapping: UberStoreMappingRepository;
  uberMenuPublishVersion: UberMenuPublishRepository;
  uberOpsTicket: UberOpsTicketRepository;
  uberOAuthStateRequest: UberOAuthStateRepository;
}
